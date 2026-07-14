// FIX-189 (pendura no WhatsApp) — a descoberta disparada por interação (clique de
// gate / self-service) NÃO rodava guard de turno-mudo: se o turno fechava só com o
// tool-call de busca (0 texto, 0 artifact), o WhatsApp não enviava nada e o usuário
// ficava no silêncio até mandar outra mensagem. Fix: runSearchSummaryWithOrchestrator
// consome os eventos COM guardEmptyTurn → um turno de descoberta mudo emite o
// fallback determinístico (nunca "atualiza a página" — respeita FIX-190).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";

const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	runTurn: vi.fn(),
	reloadMeta: vi.fn(),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("@/lib/conversation/meta", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: mocks.reloadMeta,
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({ recordStageReached: mocks.recordStageReached }));
vi.mock("@/lib/telemetry/turn-trace", () => ({
	traceTurnEvents: (events: AsyncIterable<unknown>) => events,
}));
vi.mock("@/lib/agent/orchestrator", async (orig) => ({
	...(await (orig() as Promise<Record<string, unknown>>)),
	runTurn: mocks.runTurn,
}));

import { runSearchSummaryWithOrchestrator } from "./adapter";

// Descoberta MUDA: só o tool-call de busca (chip) + finish. 0 texto, 0 artifact.
async function* muteDiscovery() {
	yield { type: "tool-call", toolName: "search_groups", toolCallId: "tc1", input: {} } as never;
	yield { type: "finish", reason: "ok" } as never;
}
// Descoberta FALANTE: reveal com texto (caso saudável).
async function* speakingDiscovery() {
	yield { type: "text-delta", text: "Olha só o que encontrei na sua faixa:" } as never;
	yield { type: "finish", reason: "ok" } as never;
}

const READY_META = {
	searchDispatched: false,
	identityCollected: true,
	currentCategory: "auto",
	currentPersona: "auto",
	qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.reloadMeta.mockResolvedValue(READY_META);
});
afterEach(() => vi.clearAllMocks());

describe("FIX-189 — descoberta muda no WhatsApp recebe fallback, não silêncio", () => {
	it("descoberta MUDA (só chip) => NUNCA fica em silêncio", async () => {
		// FIX-351: o invariante do FIX-189 é "não deixar o usuário no vácuo" — não a
		// frase específica. Antes, sem gate pendente reengajável, a única saída era o
		// EMPTY_TURN_FALLBACK ("Acho que me perdi"). Agora, se HÁ um gate com pergunta
		// pendente, o agente RE-PERGUNTA (conduzir > confessar confusão). O que não
		// pode, em nenhuma hipótese, é o turno fechar mudo.
		mocks.runTurn.mockReturnValue(muteDiscovery());
		await runSearchSummaryWithOrchestrator({ from: WA, conversationId: "c1" });
		expect(mocks.sendText).toHaveBeenCalled();
		const texto = mocks.sendText.mock.calls.at(-1)?.[1] ?? "";
		expect(texto.length).toBeGreaterThan(0);
	});

	it("descoberta FALANTE => NÃO envia o fallback (sem duplicar resposta)", async () => {
		mocks.runTurn.mockReturnValue(speakingDiscovery());
		await runSearchSummaryWithOrchestrator({ from: WA, conversationId: "c1" });
		const fallbacks = mocks.sendText.mock.calls.filter((c) => c[1] === EMPTY_TURN_FALLBACK);
		expect(fallbacks).toHaveLength(0);
	});

	it("o fallback NÃO é frase de refresh técnico (respeita FIX-190)", async () => {
		mocks.runTurn.mockReturnValue(muteDiscovery());
		await runSearchSummaryWithOrchestrator({ from: WA, conversationId: "c1" });
		for (const [, text] of mocks.sendText.mock.calls) {
			expect(String(text)).not.toMatch(/atualiz|recarregu?e|refresh/i);
		}
	});
});
