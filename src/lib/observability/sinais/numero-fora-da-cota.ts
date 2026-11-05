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
// É MEDIDA, não trava: nada aqui corta fala ou reescreve (P11). O score
// BOOLEAN sai do turno e a taxa média é o número de alucinação por turno.
//
// Lei da casa: observabilidade NUNCA derruba o turno — tudo try/catch, e sem
// envs de Langfuse é no-op.
import { langfuseLigado } from "@/lib/agent/pi/langfuse";
import { NUMBER_REGEX, matchesKnownNumber, parseNumeric } from "@/lib/eval/numeros-falados";
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
