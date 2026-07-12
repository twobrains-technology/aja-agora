// FIX-291 (b) — quando a busca na Bevi falha/degrada (discoveryFailedThisTurn),
// `searchDispatched` NÃO pode ficar travado em `true`: antes deste fix,
// `pipeSearchSummaryTurn` marcava `searchDispatched: true` PREEMPTIVAMENTE,
// ANTES de saber se a descoberta ia funcionar — então uma busca que falhou
// travava `searchDispatched=true` pra SEMPRE, e o curto-circuito da própria
// função (`if (refreshed.searchDispatched) return;`) + o de
// `orchestrator/index.ts` (`search-already-dispatched`) nunca mais deixavam
// retentar a busca num turno seguinte — o funil ficava com o gate "search"
// mudo (sem card, sem retry, sem dado real) até o usuário trocar de faixa de
// valor. Este teste prova que, com a descoberta falhando, `persistMeta` NUNCA
// grava `searchDispatched: true` — o retry num turno seguinte fica liberado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	runTurn: vi.fn(),
	reloadMeta: vi.fn(),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	saveMessage: vi.fn().mockResolvedValue("msg-1"),
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agent/orchestrator", async (orig) => ({
	...(await (orig() as Promise<Record<string, unknown>>)),
	runTurn: mocks.runTurn,
}));
vi.mock("@/lib/conversation/meta", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: mocks.reloadMeta,
}));
vi.mock("@/lib/conversation/messages", () => ({ saveMessage: mocks.saveMessage }));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({ recordStageReached: mocks.recordStageReached }));

import { pipeSearchSummaryTurn } from "./adapter";

type Part = { type: string; delta?: string; data?: unknown };
function fakeWriter() {
	const parts: Part[] = [];
	return {
		parts,
		write: (p: Part) => {
			parts.push(p);
		},
	};
}

// Descoberta que FALHOU neste turno: o orchestrator (index.ts, FIX-186) já
// suprimiu a narração crua e emitiu a mensagem honesta fixa antes do finish
// "discovery-failed" — exatamente o que runTurn produz quando
// `result.discoveryFailedThisTurn` é true.
async function* discoveryFailedTurn() {
	yield {
		type: "text-delta",
		text: "Tivemos uma instabilidade momentânea buscando as opções. Bora tentar de novo?",
	} as never;
	yield { type: "finish", reason: "discovery-failed" } as never;
}

const READY_META_NOT_DISPATCHED = {
	searchDispatched: false,
	revealCompleted: false,
	identityCollected: true,
	currentCategory: "auto",
	qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.reloadMeta.mockResolvedValue(READY_META_NOT_DISPATCHED);
});
afterEach(() => vi.clearAllMocks());

describe("FIX-291 (b) — descoberta falhada NÃO trava searchDispatched (recovery liberado)", () => {
	it("busca falhou (discovery-failed): persistMeta NUNCA grava searchDispatched:true", async () => {
		mocks.runTurn.mockReturnValue(discoveryFailedTurn());
		const writer = fakeWriter();
		await pipeSearchSummaryTurn({
			conversationId: "c1",
			contactName: "Kairo",
			writer: writer as never,
		});

		const wroteSearchDispatchedTrue = mocks.persistMeta.mock.calls.some(
			(call) => (call[1] as Record<string, unknown> | undefined)?.searchDispatched === true,
		);
		expect(wroteSearchDispatchedTrue).toBe(false);
	});

	it("busca falhou: a mensagem honesta chega ao usuário (não fica mudo)", async () => {
		mocks.runTurn.mockReturnValue(discoveryFailedTurn());
		const writer = fakeWriter();
		await pipeSearchSummaryTurn({
			conversationId: "c1",
			contactName: "Kairo",
			writer: writer as never,
		});

		const textDeltas = writer.parts.filter((p) => p.type === "text-delta").map((p) => p.delta);
		expect(textDeltas.join("")).toContain("instabilidade");
	});
});
