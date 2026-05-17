/**
 * Garante que `triggerEvalScoring` NÃO chama o judge (scoreConversation) quando
 * a conversa origem é simulada — eval custa tokens Claude e poluiria histórico
 * com pontuação fake. Crítico: gap permitiu cair $$ no PoC inicial.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerEvalScoring } from "./trigger";

vi.mock("@/db", () => {
	const queryResult: { isSimulated: boolean } = { isSimulated: true };
	return {
		db: {
			query: {
				conversations: {
					findFirst: vi.fn(async () => queryResult),
				},
			},
		},
		// Permite alterar o retorno do findFirst em cada teste via __setSimulated.
		__setSimulated(v: boolean) {
			queryResult.isSimulated = v;
		},
	};
});

const scoreConversationMock = vi.fn(async () => ({
	skipped: false,
	success: true,
	overallScore: 0.5,
	evaluationId: "fake",
}));

vi.mock("./scorer", () => ({
	scoreConversation: (...args: unknown[]) => scoreConversationMock(...args),
}));

async function setSimulated(value: boolean) {
	const dbMod = (await import("@/db")) as unknown as { __setSimulated: (v: boolean) => void };
	dbMod.__setSimulated(value);
}

afterEach(() => {
	scoreConversationMock.mockClear();
});

describe("triggerEvalScoring guard isSimulated", () => {
	it("skip total quando conversa é simulada — scoreConversation NÃO é chamado", async () => {
		await setSimulated(true);
		await triggerEvalScoring("conv-sim", "handoff");
		expect(scoreConversationMock).not.toHaveBeenCalled();
	});

	it("chama scoreConversation quando conversa é real", async () => {
		await setSimulated(false);
		await triggerEvalScoring("conv-real", "handoff");
		expect(scoreConversationMock).toHaveBeenCalledTimes(1);
	});
});
