// DETECTOR `numero_fora_da_cota` — número citado na fala que nenhuma tool
// devolveu no turno (bloco B4).
//
// "Inventar número" é o defeito mais caro do vendedor (premissa: "valor,
// parcela, prazo e administradora vêm de ferramenta"). Este sinal compara a
// fala do assistente do turno com o que as ferramentas DEVOLVERAM naquele
// turno — números de cartas, cotas, prazos, lance nos resultados de ferramenta
// disponíveis no contexto — e marca o que não veio de nenhum deles.
//
// A régua de leitura de número é a MESMA dos sinais da conversa
// (`@/lib/eval/numeros-falados`, extraída de `eval/signals.ts`): "R$ 500 mil"
// é 500.000, arredondamento de centavos é tolerado, e o que o CLIENTE disse no
// turno também é fonte — ecoar o cliente é escutar, não inventar.
//
// AFIRMAÇÃO COMPARATIVA (recado de Kairo, 05/11 00:22): número isolado não é a
// única forma de alucinar. Medido em produção: o agente disse *"a menor taxa"*
// para a proposta 20486 (12,94%) quando a 50080 tinha 12,92% — todo número da
// frase estava certo e a fala ainda assim era falsa. O superlativo é conferido
// contra o MESMO conjunto que as tools devolveram (a menor/maior opção da
// dimensão que a frase nomeia), com a mesma régua de número e a mesma tolerância
// de arredondamento. Sinal próprio (`afirmacao_comparativa_falsa`), separado do
// numérico: um mede número sem lastro, o outro mede comparação sem lastro.
//
// É MEDIDA, não trava: nada aqui corta fala ou reescreve (P11). O score
// BOOLEAN sai do turno e a taxa média é o número de alucinação por turno.
//
// Lei da casa: observabilidade NUNCA derruba o turno — tudo try/catch, e sem
// envs de Langfuse é no-op.
import { langfuseLigado } from "@/lib/agent/pi/langfuse";
import { matchesKnownNumber, NUMBER_REGEX, parseNumeric } from "@/lib/eval/numeros-falados";
import { publicarScores } from "./publicar";

/**
 * Números que o agente citou na fala e NENHUMA ferramenta do turno devolveu.
 *
 * `resultadosDeTool` é o que as tools devolveram no turno (payloads brutos,
 * artifacts incluídos) — qualquer forma de objeto/array aninhado é percorrida.
 * A fala do USUÁRIO do turno também é fonte: se o cliente disse "uma casa de
 * R$ 400 mil", o agente repetir 400.000 não é alucinação.
 */
export function numerosForaDaCota(args: {
	fala: string;
	/** Fala do cliente no mesmo turno, quando houver — eco dela é fonte. */
	falaDoCliente?: string | null;
	/** Payloads dos resultados de ferramenta do turno (artifacts incluídos). */
	resultadosDeTool: ReadonlyArray<unknown>;
}): string[] {
	const known = new Set<number>();
	for (const resultado of args.resultadosDeTool) coleteNumeros(resultado, known);
	if (args.falaDoCliente) {
		for (const match of args.falaDoCliente.matchAll(NUMBER_REGEX)) {
			const valor = parseNumeric(match[0]);
			if (valor === null) continue;
			known.add(valor);
			known.add(Math.round(valor));
		}
	}

	const fora: string[] = [];
	for (const match of args.fala.matchAll(NUMBER_REGEX)) {
		const valor = parseNumeric(match[0]);
		if (valor === null) continue;
		if (matchesKnownNumber(valor, known)) continue;
		fora.push(match[0]);
	}
	return fora;
}

/** Percorre o payload da tool e recolhe todo número finito — e as FORMAS que
 * a fala costuma usar dele: arredondamento, percent inteiro, meses↔anos. */
function coleteNumeros(value: unknown, out: Set<number>): void {
	if (typeof value === "number" && Number.isFinite(value)) {
		out.add(value);
		out.add(Math.round(value));
		out.add(Math.round(value * 100));
		if (Number.isInteger(value) && value % 12 === 0) out.add(value / 12);
		out.add(value * 12);
		return;
	}
	if (Array.isArray(value)) {
		for (const v of value) coleteNumeros(v, out);
		return;
	}
	if (value && typeof value === "object") {
		for (const v of Object.values(value)) coleteNumeros(v, out);
	}
}

// ── AFIRMAÇÃO COMPARATIVA / SUPERLATIVA ─────────────────────────────────

/** Uma dimensão comparável: o campo que a tool devolve e a palavra que a fala
 *  usa para nomeá-la. Só dimensão com o MESMO nome nos dois lados é conferida. */
type Dimensao = {
	nome: string;
	/** Chave do campo no payload da tool (sem acento, minúscula). */
	campo: RegExp;
	/** Chave que NÃO é desta dimensão mesmo casando `campo`. */
	excluir?: RegExp;
	/** Faixa em que o valor da dimensão faz sentido (fora dela não é dimensão). */
	faixa?: { min: number; max: number };
	/** Palavra da fala que nomeia a dimensão (sem acento, minúscula). */
	palavra: RegExp;
	/** Unidade do número que a fala dá para essa dimensão. */
	unidade: RegExp;
	/** Sem "menor"/"maior" na frase, "o melhor" aponta para o MENOR valor? */
	melhorEhMenor: boolean;
};

const semAcento = (t: string) =>
	t
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

const DIMENSOES: readonly Dimensao[] = [
	{
		nome: "taxa",
		campo: /taxa|adminfee|effective/, // taxaAdministracao, adminFeePercent, effectiveRate
		excluir: /contempl/, // taxa de contemplação não é taxa de administração
		faixa: { min: 0, max: 100 },
		palavra: /taxa|juros/g,
		unidade: /%/,
		melhorEhMenor: true,
	},
	{
		nome: "parcela",
		campo: /parcela|monthlypayment|mensalidade|prestacao/,
		palavra: /parcela|mensalidade|prestacao/g,
		unidade: /r\$/i,
		melhorEhMenor: true,
	},
	{
		nome: "prazo",
		campo: /prazo|termmonths/,
		palavra: /prazo|tempo/g,
		unidade: /mes|ano/i,
		melhorEhMenor: false, // "o melhor prazo" é o mais longo
	},
	{
		nome: "carta",
		campo: /^carta$|creditvalue/,
		palavra: /carta|credito/g,
		unidade: /r\$/i,
		melhorEhMenor: true,
	},
	{
		nome: "custo total",
		campo: /totalcost/,
		palavra: /custo total|total a pagar/g,
		unidade: /r\$/i,
		melhorEhMenor: true,
	},
];

/** O superlativo/comparativo que a frase AFIRMA. */
const SUPERLATIVO =
	/\b(?:menor(?:es)?|maior(?:es)?|melhor(?:es)?|mais\s+(?:baix[ao]s?|barat[ao]s?|curt[ao]s?|alt[ao]s?|car[ao]s?|long[ao]s?)|mais\s+em\s+conta)\b/g;
const MENOR = /\b(?:menor(?:es)?|mais\s+(?:baix[ao]s?|barat[ao]s?|curt[ao]s?|em\s+conta))\b/;
const MAIOR = /\b(?:maior(?:es)?|mais\s+(?:alt[ao]s?|car[ao]s?|long[ao]s?))\b/;
const MELHOR = /\b(?:melhor(?:es)?)\b/;

type Direcao = "menor" | "maior";

/** Uma comparação que a fala afirmou e o conjunto que as tools devolveram desmente. */
export type AfirmacaoComparativaFalsa = {
	/** A frase da fala em que a afirmação aparece. */
	frase: string;
	/** Dimensão comparada (taxa, parcela, prazo, carta, custo total). */
	dimensao: string;
	/** O valor que a fala deu ao sujeito. */
	dito: number;
	/** O melhor valor do conjunto — o que a fala deveria ter dito. */
	melhor: number;
};

type Campo = { chave: string; valor: number };

/** Uma frase por vez, mantendo a ordem. */
function frasesDe(texto: string): string[] {
	return texto.split(/(?<=[.!?])\s+|\n+/).filter((f) => f.trim().length > 0);
}

/** Percorre o payload da tool guardando a CHAVE de cada número — é a chave que
 *  diz a que dimensão o valor pertence (parcela, prazo, taxa…). */
function coleteCampos(value: unknown, chave: string, out: Campo[]): void {
	if (typeof value === "number" && Number.isFinite(value)) {
		if (chave) out.push({ chave: semAcento(chave), valor: value });
		return;
	}
	if (Array.isArray(value)) {
		for (const v of value) coleteCampos(v, chave, out);
		return;
	}
	if (value && typeof value === "object") {
		for (const [k, v] of Object.entries(value)) coleteCampos(v, k, out);
	}
}

/** Os valores que o conjunto comparado — tudo o que as tools devolveram — tem
 *  para essa dimensão. */
function valoresDaDimensao(campos: readonly Campo[], dim: Dimensao): Set<number> {
	const valores = new Set<number>();
	for (const { chave, valor } of campos) {
		if (!dim.campo.test(chave)) continue;
		if (dim.excluir?.test(chave)) continue;
		if (dim.faixa && (valor <= dim.faixa.min || valor > dim.faixa.max)) continue;
		valores.add(valor);
	}
	return valores;
}

/** A dimensão de que a frase fala: a palavra da dimensão mais PRÓXIMA do
 *  superlativo. Empate (ou dimensão nenhuma) = não dá para saber de quem fala —
 *  e comparação que não dá para conferir não é marcada. */
function dimensaoDaFrase(fraseSemAcento: string): Dimensao | null {
	const superlativos = [...fraseSemAcento.matchAll(SUPERLATIVO)].map((m) => m.index ?? 0);
	if (superlativos.length === 0) return null;
	const proximidades: Array<{ dim: Dimensao; distancia: number }> = [];
	for (const dim of DIMENSOES) {
		const marcas = [...fraseSemAcento.matchAll(dim.palavra)].map((m) => m.index ?? 0);
		if (marcas.length === 0) continue;
		let distancia = Number.POSITIVE_INFINITY;
		for (const s of superlativos)
			for (const k of marcas) distancia = Math.min(distancia, Math.abs(s - k));
		proximidades.push({ dim, distancia });
	}
	proximidades.sort((a, b) => a.distancia - b.distancia);
	const [primeira, segunda] = proximidades;
	if (!primeira) return null;
	if (segunda && segunda.distancia === primeira.distancia) return null;
	return primeira.dim;
}

/** O número que a frase dá para a dimensão — null quando não dá nenhum ou dá
 *  mais de um (aí não se sabe de qual se fala). */
function numeroDaDimensao(frase: string, dim: Dimensao): number | null {
	let achado: number | null = null;
	for (const m of frase.matchAll(NUMBER_REGEX)) {
		if (!dim.unidade.test(m[0])) continue;
		const valor = parseNumeric(m[0]);
		if (valor === null) continue;
		if (achado !== null) return null;
		achado = valor;
	}
	return achado;
}

function direcaoDaFrase(fraseSemAcento: string, dim: Dimensao): Direcao | null {
	if (MENOR.test(fraseSemAcento)) return "menor";
	if (MAIOR.test(fraseSemAcento)) return "maior";
	if (MELHOR.test(fraseSemAcento)) return dim.melhorEhMenor ? "menor" : "maior";
	return null;
}

/**
 * Afirmações comparativas da fala que o dado das tools DESMENTE.
 *
 * "A menor taxa: 12,94%" sobre uma proposta de 12,94% quando o conjunto que as
 * tools devolveram tem uma de 12,92% — o número da frase está certo e a
 * comparação é falsa. Marcado quando, e só quando:
 *
 *  1. a frase afirma superlativo/comparativo ("a menor", "o mais curto", "o melhor"…);
 *  2. a frase nomeia a dimensão (taxa, parcela, prazo, carta, custo total) — sem
 *     nome, a dimensão é a do conjunto que contém o número dito, e só se uma única a contiver;
 *  3. a frase dá UM número dessa dimensão (dois números = não se sabe de qual fala);
 *  4. esse número EXISTE no conjunto (número que não existe é do detector numérico,
 *     não deste — não se conta o mesmo defeito duas vezes);
 *  5. o conjunto tem outra opção MELHOR que ele (no mínimo duas opções para haver
 *     superlativo a conferir).
 *
 * Fala sem superlativo, comparação verdadeira e comparação que não dá para
 * conferir contra o conjunto: nenhuma marcação.
 */
export function afirmacoesComparativasFalsas(args: {
	fala: string;
	/** Payloads dos resultados de ferramenta do turno (artifacts incluídos). */
	resultadosDeTool: ReadonlyArray<unknown>;
}): AfirmacaoComparativaFalsa[] {
	const campos: Campo[] = [];
	for (const resultado of args.resultadosDeTool) coleteCampos(resultado, "", campos);

	const frases = frasesDe(args.fala);
	const achados: AfirmacaoComparativaFalsa[] = [];
	frases.forEach((frase, i) => {
		const semAcentoDaFrase = semAcento(frase);
		const nomeada = dimensaoDaFrase(semAcentoDaFrase);
		const direcao = nomeada ? direcaoDaFrase(semAcentoDaFrase, nomeada) : null;
		const candidatas: Dimensao[] = nomeada
			? [nomeada]
			: // "é a mais barata: R$ 2.350" — sem palavra da dimensão, quem a resolve é
				// o número dito: só vale se UM único conjunto contém esse valor.
				DIMENSOES.filter((dim) => {
					const dito = numeroDaDimensao(frase, dim);
					return dito !== null && matchesKnownNumber(dito, valoresDaDimensao(campos, dim));
				});
		if (candidatas.length !== 1) return;
		const dim = candidatas[0] as Dimensao;
		const direcaoDaAfirmacao = direcao ?? direcaoDaFrase(semAcentoDaFrase, dim);
		if (!direcaoDaAfirmacao) return;

		const conjunto = valoresDaDimensao(campos, dim);
		if (conjunto.size < 2) return;
		// O número dito pode estar na frase seguinte ("Essa é a menor taxa. Fica em 12,94%.").
		const dito = numeroDaDimensao(frase, dim) ?? numeroDaDimensao(frases[i + 1] ?? "", dim);
		if (dito === null) return;
		if (!matchesKnownNumber(dito, conjunto)) return;

		const ordenado = [...conjunto].sort((a, b) => a - b);
		const melhor =
			direcaoDaAfirmacao === "menor" ? (ordenado[0] as number) : (ordenado.at(-1) as number);
		if (matchesKnownNumber(melhor, new Set([dito]))) return;
		achados.push({ frase, dimensao: dim.nome, dito, melhor });
	});
	return achados;
}

/**
 * Grava `numero_fora_da_cota` (BOOLEAN) no trace do turno — pela mecânica de
 * publicação de sinais da casa (`publicarScores`, que anexa `traceId` ao
 * score do turno).
 *
 * No-op sem envs de Langfuse. Nunca lança: sinal não custa a resposta.
 */
export function registrarNumeroForaDaCota(args: {
	traceId: string;
	fala: string;
	falaDoCliente?: string | null;
	resultadosDeTool: ReadonlyArray<unknown>;
}): void {
	try {
		if (!langfuseLigado()) return;
		const fora = numerosForaDaCota(args);
		publicarScores(
			[
				{
					name: "numero_fora_da_cota",
					value: fora.length > 0 ? 1 : 0,
					dataType: "BOOLEAN",
					...(fora.length > 0 ? { comment: fora.join(", ") } : {}),
					traceId: args.traceId,
				},
			],
			"numero fora da cota",
		);
	} catch (erro) {
		console.error("[numero-fora-da-cota] sinal não publicado (ignorado):", erro);
	}
}

/**
 * Grava `afirmacao_comparativa_falsa` (BOOLEAN) no trace do turno: a fala
 * afirmou um superlativo que o conjunto das tools desmente ("a menor taxa" para
 * a 20486 de 12,94% quando a 50080 tem 12,92%).
 *
 * Mecânica idêntica à do sinal numérico — `publicarScores` com o `traceId` do
 * turno, no-op sem envs de Langfuse, falha engolida com log.
 */
export function registrarAfirmacaoComparativaFalsa(args: {
	traceId: string;
	fala: string;
	resultadosDeTool: ReadonlyArray<unknown>;
}): void {
	try {
		if (!langfuseLigado()) return;
		const achados = afirmacoesComparativasFalsas(args);
		publicarScores(
			[
				{
					name: "afirmacao_comparativa_falsa",
					value: achados.length > 0 ? 1 : 0,
					dataType: "BOOLEAN",
					...(achados.length > 0
						? {
								comment: achados
									.map(
										(a) =>
											`"${a.frase.trim()}" → ${a.dimensao}: disse ${a.dito}, melhor do conjunto ${a.melhor}`,
									)
									.join(" · "),
							}
						: {}),
					traceId: args.traceId,
				},
			],
			"afirmação comparativa falsa",
		);
	} catch (erro) {
		console.error("[afirmacao-comparativa-falsa] sinal não publicado (ignorado):", erro);
	}
}
