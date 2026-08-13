import { describe, expect, it } from "vitest";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { scoresDeConducao } from "./conducao-scores";

const card = (artifactType: string): TurnEvent => ({
	type: "artifact",
	artifactType: artifactType as never,
	payload: {},
	toolCallId: artifactType,
});

/** O turno da sessão `ff8f2080` (produção 2026-08-13): cinco cards de oferta na
 * tela, 30 caracteres de fala, nenhuma pergunta, nenhum gate. */
const TURNO_DO_INCIDENTE = {
	isUserTurn: true,
	perguntaEntregue: false,
	handoff: false,
	contractClosed: false,
	eventos: [card("comparison_table"), card("recommendation_card")],
};

const valor = (scores: ReturnType<typeof scoresDeConducao>, nome: string) =>
	scores.find((s) => s.name === nome)?.value;

describe("conducao_entregue", () => {
	it("pega o turno que entregou cards e não conduziu", () => {
		// É o sinal que faltava: `turno_mudo` deu 0 aqui (o agente escreveu
		// "Excelente, Kairo! Um instante.") e o painel ficou verde.
		expect(valor(scoresDeConducao(TURNO_DO_INCIDENTE), "conducao_entregue")).toBe(0);
	});

	it("card de apresentação não conduz — quem conduz é pergunta, gate ou ação", () => {
		// Um comparativo é lindo e não pede nada. O cliente olha e não sabe o que
		// fazer. Esta é a distinção que define o sinal.
		expect(
			valor(
				scoresDeConducao({ ...TURNO_DO_INCIDENTE, eventos: [card("group_card")] }),
				"conducao_entregue",
			),
		).toBe(0);
		// Já um card de DECISÃO pede resposta — isso é condução.
		expect(
			valor(
				scoresDeConducao({ ...TURNO_DO_INCIDENTE, eventos: [card("decision_prompt")] }),
				"conducao_entregue",
			),
		).toBe(1);
	});

	it("pergunta do modelo, gate do funil e handoff contam como condução", () => {
		expect(
			valor(
				scoresDeConducao({ ...TURNO_DO_INCIDENTE, perguntaEntregue: true }),
				"conducao_entregue",
			),
		).toBe(1);
		expect(
			valor(
				scoresDeConducao({
					...TURNO_DO_INCIDENTE,
					eventos: [
						...TURNO_DO_INCIDENTE.eventos,
						{ type: "gate", gate: "experience" } as TurnEvent,
					],
				}),
				"conducao_entregue",
			),
		).toBe(1);
		expect(
			valor(scoresDeConducao({ ...TURNO_DO_INCIDENTE, handoff: true }), "conducao_entregue"),
		).toBe(1);
	});

	it("não pontua o que cai nele por design", () => {
		// Turno de servidor (directive): falar sem perguntar é o esperado.
		expect(scoresDeConducao({ ...TURNO_DO_INCIDENTE, isUserTurn: false })).toEqual([]);
		// Contrato fechado: responder sem re-perguntar é o comportamento certo.
		expect(scoresDeConducao({ ...TURNO_DO_INCIDENTE, contractClosed: true })).toEqual([]);
	});

	it("formulário na tela ainda EXIGE condução — não é conversa encerrada", () => {
		// O momento mais caro da conversa inteira: o form foi despachado e o
		// cliente não preencheu. Tratar isso como "encerrado" cegaria justamente
		// onde mais se precisa de alguém puxando ("ficou alguma dúvida nos dados?").
		const scores = scoresDeConducao({ ...TURNO_DO_INCIDENTE, eventos: [card("contract_form")] });
		expect(scores.length).toBeGreaterThan(0);
		// E o formulário É condução: ele pede uma ação.
		expect(valor(scores, "conducao_entregue")).toBe(1);
	});

	it("diz QUAL gate ficou sem condução — é o que aponta o arquivo", () => {
		const scores = scoresDeConducao({ ...TURNO_DO_INCIDENTE, gateAtivo: "experience" });
		expect(scores.find((s) => s.name === "conducao_ausente_gate")?.value).toBe("experience");
		// Turno que conduziu não polui a dimensão.
		const ok = scoresDeConducao({
			...TURNO_DO_INCIDENTE,
			gateAtivo: "experience",
			perguntaEntregue: true,
		});
		expect(ok.find((s) => s.name === "conducao_ausente_gate")).toBeUndefined();
	});
});
