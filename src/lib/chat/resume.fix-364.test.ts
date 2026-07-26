// FIX-364 (bloco-h-resume-mesa) — teste de integração de `getResumableConversation`:
// com `contractClosed: true` no meta persistido, a retomada NÃO pode devolver
// um card de gate de qualificação (`credit`/`lance`/`decision`/...) — o que
// fazia o cliente que já fechou a proposta voltar ("Voltei") e o agente repetir
// pergunta de etapa anterior. Mocka `@/db` (unitário, sem depender de Postgres).

import { describe, expect, it, vi } from "vitest";

const findFirstMock = vi.fn();

vi.mock("@/db", () => ({
	db: {
		query: {
			conversations: { findFirst: (...args: unknown[]) => findFirstMock(...args) },
		},
	},
}));

describe("FIX-364 — getResumableConversation não re-emite gate de qualificação com proposta fechada", () => {
	it("meta com contractClosed=true → gate da retomada é null (nenhum card de etapa anterior)", async () => {
		findFirstMock.mockResolvedValue({
			id: "conv-fix-364",
			contactName: "Kairo",
			updatedAt: new Date("2026-07-22T10:00:00Z"),
			createdAt: new Date("2026-07-22T09:00:00Z"),
			metadata: {
				contractClosed: true,
				revealCompleted: true,
				identityCollected: true,
				searchDispatched: true,
				desireAsked: true,
				decisionDispatched: true,
				escolha: { origem: "mencao" },
				contractFormDispatched: true,
				// qualifyAnswers incompleto de propósito — simula o meta reidratado
				// que reproduzia o bug antes do fix em nextGate.
				qualifyAnswers: { creditMax: 90_000, creditMin: 70_000 },
			},
			messages: [
				{
					id: "m1",
					role: "user",
					content: "quero um carro de 90 mil",
					createdAt: new Date("2026-07-22T09:01:00Z"),
					artifacts: [],
				},
				{
					id: "m2",
					role: "assistant",
					content: "Parabéns! Agora você está oficialmente mais perto da sua conquista!",
					createdAt: new Date("2026-07-22T09:50:00Z"),
					artifacts: [],
				},
			],
		});

		const { getResumableConversation } = await import("./resume");
		const r = await getResumableConversation("cookie-fix-364");

		expect(r).not.toBeNull();
		expect(r?.gate).toBeNull();
		expect(r?.meaningfulProgress).toBe(true);
	});
});
