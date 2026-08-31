/**
 * O sinal que faltava: a carta chegou à tela?
 *
 * Entre 14 e 26/08/2026 o `judge_avancou` marcou **0,92** em 335 turnos de
 * produção — o juiz achava que o funil estava andando em 92% dos turnos. No
 * mesmo período, 70 conversas de cliente externo produziram **2 contratos**.
 *
 * Os dois números convivem porque medem coisas diferentes. `judge_avancou` lê a
 * FALA e pergunta "este turno tentou avançar?" — e o turno que pede o CPF pela
 * quarta vez (conv b80ad628) tentou avançar. Juiz de prosa nunca enxerga funil
 * parado; para isso é preciso um sinal de ESTADO.
 *
 * `carta_na_tela` é esse sinal, na forma mais barata possível: o turno colocou
 * uma oferta real na frente do cliente, sim ou não. Determinístico, derivado do
 * que o servidor de fato emitiu, sem LLM no meio. Agregado no Langfuse ele
 * responde a pergunta que o painel não respondia — "de cada 100 turnos, em
 * quantos o cliente viu preço?" — e é a métrica que mede se a vitrine funcionou.
 */
import { describe, expect, it } from "vitest";
import type { TurnTraceRecord } from "@/lib/telemetry/turn-trace";
import { scoresDoTurno } from "./funil-scores";

function turno(over: Partial<TurnTraceRecord> = {}): TurnTraceRecord {
	return {
		traceId: "t-1",
		conversationId: "c-1",
		channel: "web",
		persona: "helena-auto",
		gate: null,
		toolsCalled: [],
		toolCount: 0,
		artifactsEmitted: [],
		artifactCount: 0,
		suppressed: [],
		cacheRead: null,
		cacheWrite: null,
		textChars: 40,
		handoff: false,
		transitionedTo: null,
		leadStage: null,
		durationMs: 100,
		...over,
	} as TurnTraceRecord;
}

const valorDe = (r: TurnTraceRecord, nome: string) =>
	scoresDoTurno(r).find((s) => s.name === nome)?.value;

describe("carta_na_tela", () => {
	it("é 1 quando a tabela de comparação foi emitida", () => {
		const r = turno({ artifactsEmitted: ["comparison_table"], artifactCount: 1 });
		expect(valorDe(r, "carta_na_tela")).toBe(1);
	});

	it("é 1 para o hero (recommendation_card) e para a oferta real", () => {
		expect(
			valorDe(
				turno({ artifactsEmitted: ["recommendation_card"], artifactCount: 1 }),
				"carta_na_tela",
			),
		).toBe(1);
		expect(
			valorDe(turno({ artifactsEmitted: ["real_offer"], artifactCount: 1 }), "carta_na_tela"),
		).toBe(1);
	});

	it("é 0 no turno que só faz pergunta — o caso que o juiz aprovava", () => {
		// conv b80ad628: quatro turnos seguidos de "preciso do seu CPF e celular".
		// `judge_avancou` deu nota alta em todos; `carta_na_tela` dá zero em todos.
		const r = turno({ gate: "identify", textChars: 120 });
		expect(valorDe(r, "carta_na_tela")).toBe(0);
	});

	it("é 0 quando o card emitido não é oferta (quick_reply não é preço)", () => {
		const r = turno({ artifactsEmitted: ["quick_reply"], artifactCount: 1 });
		expect(valorDe(r, "carta_na_tela")).toBe(0);
	});

	it("é emitido em TODO turno — ausência de carta é medição, não lacuna", () => {
		// Um score que só aparece quando vale 1 não tem denominador: a média no
		// Langfuse daria 1,0 para sempre, exatamente o vício que este sinal existe
		// para corrigir.
		expect(scoresDoTurno(turno()).some((s) => s.name === "carta_na_tela")).toBe(true);
	});
});
