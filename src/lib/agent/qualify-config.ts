import type { Category, Objetivo } from "@/lib/agent/personas";

// ============================================================================
// CONTRATO — bloco-jornada-entrada (revisão da jornada de entrada, Kairo 2026-06-28)
// ----------------------------------------------------------------------------
// Os blocos irmãos (web-valor-agulha, whatsapp-apresentacao) dependem deste:
//
//  1. O agente PARA de emitir `present_value_picker` NA ENTRADA — o valor do bem
//     vira CONVERSA (texto livre, normalizado). A tool segue existindo; a WEB a
//     troca por um slider simples (1k em 1k, FIX-115), o WhatsApp não manda mais a
//     lista de faixas — pergunta o valor por TEXTO (FIX-120, wiring do adapter
//     feito). (FIX-104)
//  2. O gate `timeframe` (prazo de contemplação) SAIU da qualificação —
//     `nextGate` (qualify-state.ts) nunca mais o emite. "timeframe" segue no
//     union `Gate` e `TIMEFRAME_OPTIONS`/`objetivoForPrazo`/`prazoMesesForIntent`
//     ficam aqui como LEGADO (web/whatsapp ainda importam; blocos irmãos limpam).
//     (FIX-103)
//  3. O simulador de contemplação é conduzido em LOOP conversacional pelo agente
//     (tool `simulate_contemplation` em tools/ai-sdk.ts). A WEB mantém a agulha
//     arrastável (`present_contemplation_dial`). (FIX-106)
// ============================================================================

/**
 * Single source of truth for qualification ranges/buckets across channels.
 *
 * - **Web** uses `bounds` for sliders (continuous values).
 * - **WhatsApp** uses `buckets` for interactive lists (discrete choices).
 *
 * To change a range or add a new bucket: edit only this file.
 */

/**
 * FIX-105 — classificação HÍBRIDA dos gates de qualificação (decisão Kairo
 * 2026-06-28). Perguntas BINÁRIAS (resposta clara e rápida) mantêm o BOTÃO;
 * a pergunta ABERTA de valor vira CONVERSA (texto livre — FIX-104). Contrato
 * consumido pelos blocos de canal (web/whatsapp) pra escolher o tipo de input
 * de cada gate: renderizar `conversation` como texto, não como componente de
 * seleção. Wiring feito nos dois canais: web-valor-agulha (FIX-115, agulha →
 * texto livre) e whatsapp (FIX-120, adapter pergunta o valor por texto).
 *
 * Observação (FIX-103): o gate `timeframe` (prazo) saiu da qualificação — não
 * é classificado aqui. `name`/`identify`/`search`/`simulator-offer`/`decision`
 * não são gates de qualificação de perfil (são captura/funil), fora deste mapa.
 */
export type GateInputKind = "button" | "conversation";

export const QUALIFY_GATE_INPUT_KIND = {
	experience: "button",
	consent: "button",
	credit: "conversation",
	lance: "button",
	"lance-value": "conversation",
	"lance-embutido": "button",
} as const satisfies Record<string, GateInputKind>;

export type Bounds = {
	min: number;
	max: number;
	step: number;
	default: number;
};

export type Bucket = {
	token: string;
	title: string;
	desc?: string;
	min: number;
	max: number;
};

export type TimeframeOption = {
	token: string;
	title: string;
	desc: string;
	prazoMeses: number;
	/** Eixo Bevi derivado do prazo. Pressa => contemplacao_rapida; sem pressa => investimento. */
	objetivo: Objetivo;
};

// ---- Credit (valor do bem) ----

export const CREDIT_BOUNDS: Record<Category, Bounds> = {
	imovel: { min: 100_000, max: 2_000_000, step: 50_000, default: 400_000 },
	// FIX-54: teto elevado 300k → 500k (carros novos/premium passavam de 300k).
	// Alinha com `servicos` e cobre a faixa real sem virar irreal pra Bevi.
	// FIX-55: step 10k → 1k (granularidade fina no slider; o input livre dos
	// componentes cobre a precisão exata de valores quebrados).
	auto: { min: 20_000, max: 500_000, step: 1_000, default: 80_000 },
	moto: { min: 8_000, max: 80_000, step: 1_000, default: 25_000 },
	servicos: { min: 10_000, max: 500_000, step: 10_000, default: 60_000 },
};

export type CreditClamp = {
	/** Valor ajustado pra dentro da faixa [min, max] da categoria. */
	value: number;
	/** true quando o valor original caiu fora da faixa (foi ajustado). */
	clamped: boolean;
	min: number;
	max: number;
};

/** FIX-33 (revogado por FIX-218, Ata 2026-07-04) — guardrail server-side que
 * capava o valor do bem na faixa da categoria. Decisão do cliente: "não há
 * integração com grupos nesse ponto, então qualquer valor é válido" — o valor
 * digitado/dito é SEMPRE aceito como veio; a busca (FIX-219) traz a ordem de
 * grandeza mais próxima em vez do valor exato. `min`/`max` seguem devolvidos
 * (dica visual do slider, derivação de creditMin), mas `value` nunca é mais
 * ajustado e `clamped` é sempre `false`. */
export function clampCreditToCategory(credit: number, category: Category): CreditClamp {
	const { min, max } = CREDIT_BOUNDS[category];
	return { value: Math.round(credit), clamped: false, min, max };
}

/**
 * FIX-104 — normalizador DETERMINÍSTICO do valor do bem dito em texto livre.
 *
 * A entrada deixa de usar o `present_value_picker`: o usuário FALA o valor do bem
 * ("um carro de uns 80 mil", "80k", "R$ 80.000"). O turn-analyzer (LLM) é o
 * extrator de runtime — entende inclusive por extenso ("oitenta mil"). Este
 * helper é o CONTRATO determinístico + backstop, fonte única de parsing pros
 * caminhos não-LLM: o input de texto livre do slider simples da web (FIX-218,
 * consumido em `value-picker.tsx`) e qualquer validação determinística. Cobre
 * dígitos com multiplicador (mil/milhão/k/mi) e formatos BRL; retorna null pra
 * texto por extenso (deixa o LLM resolver).
 */
export function parseValorDoBem(text: string): number | null {
	if (!text) return null;
	const lower = text.toLowerCase();
	// 1) Captura "<número> [mil|milhão|milhões|mi|k]" — número aceita ponto/vírgula.
	// Ordem da alternância importa: `milh…` e `mil` ANTES de `mi` (senão "mil"
	// casaria o prefixo "mi" → multiplicador de milhão errado).
	const m = lower.match(/(\d[\d.,]*)\s*(milh(?:ão|ões|oes)|mil|mi|k)?/);
	if (!m) return null;
	const rawNum = m[1];
	const unit = m[2];
	// Normaliza o número: se tem unidade (mil/milhão/k), ponto/vírgula são decimais
	// ("1,5 milhão" = 1.5). Sem unidade, ponto/vírgula são separadores de milhar
	// ("80.000" = 80000, "80.000,00" = 80000).
	let value: number;
	if (unit) {
		// Com unidade o número é pequeno e o separador é DECIMAL ("1,5"/"1.5" = 1.5).
		const normalized = rawNum.replace(",", ".");
		value = Number.parseFloat(normalized);
	} else {
		// Remove separadores de milhar (.) e centavos (,XX) de formato BRL.
		const noCents = rawNum.replace(/,\d{1,2}$/, "");
		value = Number.parseFloat(noCents.replace(/[.,]/g, ""));
	}
	if (!Number.isFinite(value) || value <= 0) return null;
	const multiplier =
		unit === "mil"
			? 1_000
			: unit === "k"
				? 1_000
				: unit === "mi" || unit?.startsWith("milh")
					? 1_000_000
					: 1;
	return Math.round(value * multiplier);
}

export const CREDIT_BUCKETS: Record<Category, Bucket[]> = {
	imovel: [
		{ token: "200", title: "Até R$ 200 mil", desc: "Aptos compactos", min: 0, max: 200_000 },
		{
			token: "400",
			title: "R$ 200 a 400 mil",
			desc: "Aptos 2-3 quartos",
			min: 200_000,
			max: 400_000,
		},
		{
			token: "600",
			title: "R$ 400 a 600 mil",
			desc: "Casas, aptos maiores",
			min: 400_000,
			max: 600_000,
		},
		{
			token: "1000",
			title: "Acima de R$ 600 mil",
			desc: "Alto padrão, luxo",
			min: 600_000,
			max: 2_000_000,
		},
	],
	auto: [
		{ token: "50", title: "Até R$ 50 mil", desc: "Seminovos, populares", min: 0, max: 50_000 },
		{ token: "100", title: "R$ 50 a 100 mil", desc: "Populares, sedãs", min: 50_000, max: 100_000 },
		{
			token: "200",
			title: "R$ 100 a 200 mil",
			desc: "SUVs, premium",
			min: 100_000,
			max: 200_000,
		},
		{
			token: "300",
			title: "Acima de R$ 200 mil",
			desc: "Top de linha",
			min: 200_000,
			// FIX-54: acompanha o novo teto de auto (CREDIT_BOUNDS) — multicanal coerente.
			max: 500_000,
		},
	],
	moto: [
		{ token: "15", title: "Até R$ 15 mil", desc: "Entrada, custo benefício", min: 0, max: 15_000 },
		{ token: "30", title: "R$ 15 a 30 mil", desc: "Naked, scooter", min: 15_000, max: 30_000 },
		{
			token: "50",
			title: "R$ 30 a 50 mil",
			desc: "Trail, esportivas médias",
			min: 30_000,
			max: 50_000,
		},
		{
			token: "80",
			title: "Acima de R$ 50 mil",
			desc: "Big trail, esportiva",
			min: 50_000,
			max: 80_000,
		},
	],
	servicos: [
		{
			token: "30",
			title: "Até R$ 30 mil",
			desc: "Reformas simples, viagens",
			min: 0,
			max: 30_000,
		},
		{
			token: "100",
			title: "R$ 30 a 100 mil",
			desc: "Reformas médias, formaturas",
			min: 30_000,
			max: 100_000,
		},
		{
			token: "500",
			title: "Acima de R$ 100 mil",
			desc: "Grandes projetos",
			min: 100_000,
			max: 500_000,
		},
	],
};

// ---- Lance embutido (jornada do doc 2026-05-29) ----
//
// Quando o usuário tem reserva pra lance ("yes"), o doc manda educar sobre
// lance embutido e oferecer a opção de considerá-lo nas simulações. Decisão de
// design (D3): consolidamos a educação + opt-in num gate binário só, claro pra
// leigo. O percentual (Bevi aceita 30 ou 50) fica interno, default 30 — o valor
// mais comum na captura real do simulador Bevi.
export const LANCE_EMBUTIDO_DEFAULT_PERCENT = 30 as const;

export type LanceEmbutidoOption = {
	token: "yes" | "no";
	title: string;
	desc: string;
};

export const LANCE_EMBUTIDO_OPTIONS: LanceEmbutidoOption[] = [
	{
		token: "yes",
		title: "Sim, considerar lance embutido",
		desc: "Uso parte da carta como lance",
	},
	{
		token: "no",
		// FIX-4: rótulo neutro — o gate agora aparece TAMBÉM pra quem não tem
		// reserva ("recursos próprios" pressupunha dinheiro em mãos).
		title: "Não, prefiro sem lance embutido",
		desc: "Sigo sem usar a carta como lance",
	},
];

/** Deriva o eixo `objetivo` da Bevi a partir do prazo escolhido. Prazos longos
 * (>= 120 meses, "sem pressa, quero menor parcela") => investimento; o resto,
 * onde o usuário quer o bem logo => contemplacao_rapida. Fonte única pra web,
 * WhatsApp e extração de texto livre. */
export function objetivoForPrazo(prazoMeses: number): Objetivo {
	return prazoMeses >= 120 ? "investimento" : "contemplacao_rapida";
}

// ---- Valor do lance (docx passo 2: "Qual valor aproximado?") ----
//
// Faixas RELATIVAS ao crédito escolhido (10/20/30/40%+), com o valor absoluto
// no título — "aproximado" como o docx pede, e clicável nos dois canais
// (chips na web, lista no WhatsApp). token = valor médio da faixa em reais.

const fmtMil = (n: number) =>
	n >= 1_000_000
		? `R$ ${(n / 1_000_000).toFixed(1).replace(".", ",")} mi`
		: `R$ ${Math.round(n / 1000)} mil`;

export function lanceValueOptions(creditMax: number): Bucket[] {
	const pct = (p: number) => Math.round((creditMax * p) / 1000) * 1000;
	return [
		{
			token: String(pct(0.1)),
			title: `Até ${fmtMil(pct(0.1))}`,
			desc: "~10% da carta",
			min: 0,
			max: pct(0.1),
		},
		{
			token: String(pct(0.2)),
			title: `Uns ${fmtMil(pct(0.2))}`,
			desc: "~20% da carta",
			min: pct(0.1),
			max: pct(0.2),
		},
		{
			token: String(pct(0.3)),
			title: `Uns ${fmtMil(pct(0.3))}`,
			desc: "~30% da carta",
			min: pct(0.2),
			max: pct(0.3),
		},
		{
			token: String(pct(0.4)),
			title: `${fmtMil(pct(0.4))} ou mais`,
			desc: "40%+ da carta",
			min: pct(0.3),
			max: pct(0.5),
		},
	];
}

// ---- Monthly budget (parcela mensal) ----
// LEGADO do picker de 4 sliders. No picker novo (handoff, guiado por intenção) a
// parcela é RESULTADO, não input — estes bounds só servem ao caminho de texto livre.

export const MONTHLY_BOUNDS: Record<Category, Bounds> = {
	imovel: { min: 1_000, max: 15_000, step: 500, default: 3_000 },
	auto: { min: 300, max: 3_000, step: 100, default: 800 },
	moto: { min: 150, max: 1_500, step: 50, default: 500 },
	servicos: { min: 200, max: 2_000, step: 100, default: 500 },
};

// ---- Prazo do plano (handoff, re-UX por intenção) ----
// O usuário escolhe o prazo DIRETO num slider ("Em quantos meses quer pagar") e a
// parcela vira o resultado calmo (total / prazo). Ranges típicos de grupo por
// categoria (default = ponto típico de mercado, espelha TYPICAL_TERM_MONTHS).

export const TERM_BOUNDS: Record<Category, Bounds> = {
	imovel: { min: 120, max: 240, step: 12, default: 180 },
	auto: { min: 36, max: 100, step: 6, default: 72 },
	moto: { min: 24, max: 80, step: 6, default: 60 },
	servicos: { min: 12, max: 60, step: 6, default: 40 },
};

// ---- Intenção do "Planeje sua conquista" (segmented control do handoff) ----
// "O que mais importa pra você agora?" — dirige quais controles condicionais
// aparecem e o eixo `objetivo` da Bevi. Mapeia a pergunta "Em quanto tempo você
// quer o bem?" da jornada canônica num controle de prioridade, sem despejar 4
// sliders de uma vez.
export type PlanIntent = "parcela" | "rapido" | "lance";

/** Deriva o eixo `objetivo` da Bevi a partir da intenção escolhida. "Menor
 * parcela" = investimento (sem pressa); "receber rápido" e "tenho um lance"
 * miram contemplação acelerada. Fonte única do mapeamento intenção→objetivo. */
export function objetivoForIntent(intent: PlanIntent): Objetivo {
	return intent === "parcela" ? "investimento" : "contemplacao_rapida";
}

/** Prazo de contemplação (mês-alvo) IMPLÍCITO por intenção, quando o usuário não
 * escolhe um mês específico (só a intenção "receber rápido" coleta o mês exato no
 * slider). Preenche `prazoMeses` no qualifyAnswers pro funil PULAR o gate
 * timeframe — senão o agente re-pergunta "em quanto tempo você quer o bem?" logo
 * depois do usuário escolher a prioridade (quebra do híbrido vendedor).
 * "Menor parcela" = sem pressa (120m, eixo investimento); "tenho um lance" =
 * antecipar o quanto der (mais rápido possível). */
export function prazoMesesForIntent(intent: PlanIntent): number {
	return intent === "parcela" ? 120 : intent === "lance" ? 0 : 6;
}

// ---- Timeframe (LEGADO — FIX-103) ----
//
// ⚠️ LEGADO. O gate `timeframe` SAIU da qualificação (FIX-103, 2026-06-28):
// `nextGate` (qualify-state.ts) nunca mais o emite. Estas opções permanecem só
// por compat com consumidores fora do escopo deste bloco (web/adapter.ts,
// whatsapp/formatter.ts) que os blocos irmãos (web-valor-agulha,
// whatsapp-apresentacao) vão limpar. NÃO use em caminho novo de runtime.
//
// Jornada canônica do .docx (2026-05-29): 5 opções de prazo. Cada uma deriva o
// `objetivo` da Bevi (contemplacao_rapida × investimento), input nativo da simulação.
export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
	{
		token: "0",
		title: "O mais rápido possível",
		desc: "Contemplação acelerada",
		prazoMeses: 0,
		objetivo: "contemplacao_rapida",
	},
	{
		token: "6",
		title: "Até 6 meses",
		desc: "Bem logo",
		prazoMeses: 6,
		objetivo: "contemplacao_rapida",
	},
	{
		token: "12",
		title: "1 ano",
		desc: "Curto prazo",
		prazoMeses: 12,
		objetivo: "contemplacao_rapida",
	},
	{
		token: "24",
		title: "2 anos ou mais",
		desc: "Médio prazo",
		prazoMeses: 24,
		objetivo: "contemplacao_rapida",
	},
	{
		token: "120",
		title: "Sem pressa, quero menor parcela",
		desc: "Parcela mais leve",
		prazoMeses: 120,
		objetivo: "investimento",
	},
];
