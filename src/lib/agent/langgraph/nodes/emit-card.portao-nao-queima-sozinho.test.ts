/**
 * D9 (PRD 19/08/2026, conversa da Rute) — UM PORTÃO CONSUMIDO SEM QUE A
 * PERGUNTA FOSSE FEITA.
 *
 * No estado final da conversa, `experienceDispatched = true`. A pergunta ("você
 * já fez consórcio antes?") não existe em lugar nenhum da transcrição — nem em
 * texto, nem em card.
 *
 * O portão é de uso único de propósito (FIX: o gate reaparecia turno após turno
 * enquanto a resposta não vinha). Queimá-lo num turno gerado por INSTRUÇÃO DO
 * SISTEMA — um clique de botão que virou directive, em pleno fechamento — gasta
 * a única chance de perguntar sem que ninguém tenha perguntado nada. O dado
 * ajuda a vender e some para sempre.
 *
 * Turno do cliente consome normalmente: lá a pergunta de fato foi feita a ele.
 */

import { describe, expect, it, vi } from "vitest";
import type { AgentGraphStateType } from "../state";

vi.mock("@/lib/conversation/identity", () => ({ loadIdentity: async () => null }));

const { emitCardNode } = await import("./emit-card");

function estado(over: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
	return {
		conversationId: "conv-rute",
		channel: "web",
		contactName: "Rute",
		isUserTurn: true,
		userText: "",
		intent: "neutral",
		baseMeta: {},
		gate: "experience",
		events: [],
		messages: [],
		modelAskedQuestion: false,
		modelAskedForName: false,
		apresentaOfertaNesteTurno: false,
		ancoraFalhou: false,
		streamedArtifactIds: [],
		funnel: {
			currentPersona: "helena-imovel",
			currentCategory: "imovel",
			desireAsked: true,
			qualifyAnswers: {},
			identityCollected: true,
			searchDispatched: true,
			revealCompleted: true,
			decisionDispatched: false,
		},
		...over,
	} as unknown as AgentGraphStateType;
}

describe("D9 — o portão de uso único só se gasta em turno do cliente", () => {
	it("turno gerado por instrução do sistema NÃO queima o gate `experience`", async () => {
		const out = await emitCardNode(estado({ isUserTurn: false }));
		expect(out.funnel?.experienceDispatched).not.toBe(true);
	});

	it("e o gate nem CHEGA a sair nesse turno — a pergunta não se pendura sob a resposta de um clique", async () => {
		// Metade do defeito estava na queima da flag; a outra metade é a EMISSÃO.
		// Um clique em "Ver cenários" vira directive, e os chips de "você já fez
		// consórcio antes?" caíam embaixo da resposta dos cenários — a pergunta
		// que ninguém fez, no meio do assunto que o cliente pediu.
		const out = await emitCardNode(estado({ isUserTurn: false }));
		const gates = (out.events ?? []).filter((e) => e.type === "gate");
		expect(gates).toHaveLength(0);
	});

	it("gate de COLETA continua saindo em turno do sistema (reação a clique conduz)", async () => {
		// FIX-206: clique → directive → próximo passo no mesmo turno. Isso não
		// muda; o que cede é só o gate OPCIONAL (`experience`), que existe para
		// ajudar a vender e não para ser pedágio.
		const out = await emitCardNode(estado({ isUserTurn: false, gate: "credit" }));
		const gates = (out.events ?? []).filter((e) => e.type === "gate");
		expect(gates).toHaveLength(1);
	});

	it("turno do cliente consome normalmente — a pergunta foi feita a ele", async () => {
		const out = await emitCardNode(estado({ isUserTurn: true }));
		expect(out.funnel?.experienceDispatched).toBe(true);
	});
});
