// FIX-115 (PROD 2026-06-30) — backstop DETERMINÍSTICO do valor do bem.
//
// O valor do bem é coletado por CONVERSA (FIX-104): o analyzer LLM extrai o
// creditMax do texto livre. Mas o analyzer cai em NEUTRAL_FALLBACK (creditMax=null)
// em timeout de cold-start da Anthropic — e aí "50k" digitado não vira número, o
// gate `credit` re-dispara e o funil TRAVA (requisito do Kairo: "se o componente
// nao aparecer tem que se resolver mesmo assim"). Este parser é o backstop: puro,
// sem LLM, cobre as formas comuns que o usuário digita ("50k", "50 mil",
// "R$ 50.000", "1,5 milhão"). NÃO substitui o analyzer — só entra quando ele falha.
//
// Conservador de propósito: número NU pequeno sem marcador (mil/k/R$/milhão) é
// ambíguo demais pra cravar como valor de bem — deixa pro analyzer. E NUNCA lê
// orçamento mensal ("850 por mês") como valor do bem.
//
// FIX-208 (PROD 2026-07-02): EXCEÇÃO conservadora — quando o gate `credit` está
// pendente (o usuário está respondendo "Qual valor do bem?") e a categoria é
// conhecida, um número NU vira valor: quem responde "200" pra um carro quer
// R$ 200 mil. Só nesse contexto; fora dele o número nu segue null.

import type { Category } from "@/lib/agent/personas";
import { CREDIT_BOUNDS, clampCreditToCategory } from "@/lib/agent/qualify-config";
import type { Gate } from "@/lib/agent/qualify-state";

/** Contexto do funil pra desambiguar número nu (FIX-208). Só o gate `credit`
 * com categoria conhecida habilita a leitura de número nu como valor do bem. */
export type AssetValueContext = { gate?: Gate | null; category?: Category | null };

/** Marca orçamento/parcela mensal — quando presente, o número é parcela, não o
 * valor do bem. Espelha a separação que o turn-analyzer faz (850/mês = orçamento). */
const MONTHLY_MARKER = /(\/\s*m[êe]s|por\s+m[êe]s|ao\s+m[êe]s|mensa(l|is)|\/m\b|\bmes\b)/i;

/** Converte o miolo numérico de um valor BR EXPLÍCITO ("347.500", "50.000,00")
 * em Number. Ponto = separador de milhar; vírgula = decimal. */
function brNumber(raw: string): number | null {
	const cleaned = raw.replace(/\s/g, "");
	if (!/[0-9]/.test(cleaned)) return null;
	// Remove separador de milhar (ponto) e troca decimal (vírgula) por ponto.
	const normalized = cleaned.replace(/\./g, "").replace(",", ".");
	const n = Number.parseFloat(normalized);
	return Number.isFinite(n) ? n : null;
}

/** Converte o COUNT antes de uma magnitude (mil/k/milhão) em Number. Aqui o
 * separador é DECIMAL — ninguém escreve milhar antes de "mil" ("50 mil", "1,5
 * milhão", "1.5k"): o ponto/vírgula é a casa decimal. Só cai no milhar-BR se
 * vier um agrupamento explícito de 3 dígitos ("1.500 mil"). */
function magnitudeCount(raw: string): number | null {
	const cleaned = raw.replace(/\s/g, "");
	const simple = cleaned.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
	if (simple) {
		const n = Number.parseFloat(simple[2] ? `${simple[1]}.${simple[2]}` : simple[1]);
		return Number.isFinite(n) ? n : null;
	}
	return brNumber(cleaned);
}

/** FIX-208: a mensagem é ESSENCIALMENTE um número (1 grupo de dígitos, ≤ 4
 * palavras)? Só então um número nu no gate `credit` é lido como valor — evita
 * cravar valor de uma pergunta solta com número ("e a taxa de 2%?"). Lei 4:
 * não age sobre número não-ancorado no valor do bem. Retorna o número ou null. */
function bareNumberAsValue(t: string): number | null {
	// O dígito precisa ser um TOKEN, não um pedaço de palavra. Sem esta âncora,
	// "rav4" virava o número 4 → carta de R$ 4.000: o `creditMax` era gravado
	// com lixo, o gate de valor nunca disparava (só dispara enquanto o valor é
	// `undefined`) e o slider era substituído pelo formulário de CPF. Vale pra
	// qualquer modelo com número no nome — hb20, 208, t-cross, i30.
	const NUMERO_SOLTO = /(?<![\p{L}\d])\d+(?:[.,]\d{1,2})?(?![\p{L}])/gu;
	const digitGroups = t.match(NUMERO_SOLTO) ?? [];
	const words = t.trim().split(/\s+/).filter(Boolean);
	if (digitGroups.length !== 1 || words.length > 4) return null;
	const m = digitGroups[0].match(/(\d+)(?:[.,](\d{1,2}))?/);
	if (!m) return null;
	const n = Number.parseFloat(m[2] ? `${m[1]}.${m[2]}` : m[1]);
	return Number.isFinite(n) && n > 0 ? n : null;
}

/** Um número nu no gate de valor é dado em MILHARES quando abaixo do piso da
 * faixa do bem ("200" pra carro = R$ 200 mil); no piso ou acima já é reais crus. */
function scaleBareToAssetValue(n: number, category: Category): number {
	const { min } = CREDIT_BOUNDS[category];
	return n >= min ? Math.round(n) : Math.round(n * 1000);
}

/**
 * Extrai o VALOR DO BEM (em reais) de um texto livre, de forma determinística.
 * Retorna `null` quando não há um valor claramente de bem (número ambíguo,
 * orçamento mensal, ou texto sem número).
 *
 * FIX-208: `ctx` habilita a leitura de número NU quando o gate `credit` está
 * pendente com categoria conhecida (o usuário está respondendo o valor). Sem
 * `ctx` (ou fora do gate credit), o comportamento é o de sempre — número nu = null.
 */
export function parseAssetValue(
	text: string | null | undefined,
	ctx?: AssetValueContext,
): number | null {
	if (!text) return null;
	const t = text.toLowerCase();
	if (MONTHLY_MARKER.test(t)) return null;

	// 1) Magnitude "milhão/milhões/mi": "1 milhão", "1,5 milhão", "2 mi".
	const mi = t.match(/(\d[\d.]*(?:,\d+)?)\s*(?:milh(?:ão|ao|ões|oes)|mi)\b/);
	if (mi) {
		const n = magnitudeCount(mi[1]);
		if (n !== null) return Math.round(n * 1_000_000);
	}

	// 2) Magnitude "mil" ou "k": "50 mil", "80mil", "50k", "1,5k".
	const mil = t.match(/(\d[\d.]*(?:,\d+)?)\s*(?:mil\b|k\b)/);
	if (mil) {
		const n = magnitudeCount(mil[1]);
		if (n !== null) return Math.round(n * 1000);
	}

	// 3) Valor explícito com R$: "R$ 50.000", "R$50.000,00".
	const reais = t.match(/r\$\s*(\d[\d.]*(?:,\d{1,2})?)/);
	if (reais) {
		const n = brNumber(reais[1]);
		if (n !== null) return Math.round(n);
	}

	// 4) Número nu GRANDE com separador de milhar BR: "240.000", "50.000".
	// Exige o ponto de milhar (>= 4 dígitos no total) pra evitar cravar "80" cru.
	const bare = t.match(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)\b/);
	if (bare) {
		const n = brNumber(bare[1]);
		if (n !== null) return Math.round(n);
	}

	// 5) FIX-208 — número NU sem marcador ("200"), SÓ no contexto do gate `credit`
	// com categoria conhecida (o usuário respondendo o valor do bem). Escala pra
	// milhares quando abaixo do piso da faixa. FIX-218 (Ata 2026-07-04): o valor
	// escalado NÃO é mais capado na faixa da categoria — sobrevive intacto, mesmo
	// acima do teto real. Fora desse contexto o número nu segue ambíguo (retorna
	// null logo abaixo).
	if (ctx?.gate === "credit" && ctx.category) {
		const n = bareNumberAsValue(t);
		if (n !== null) {
			return clampCreditToCategory(scaleBareToAssetValue(n, ctx.category), ctx.category).value;
		}
	}

	return null;
}
