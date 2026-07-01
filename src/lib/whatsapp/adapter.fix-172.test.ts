// Camada 2 (FIX-172) — guard de turno-mudo no WhatsApp ("agente mudo ao receber o nome").
//
// Bug REAL (QA autônomo, 2026-07-01): usuário responde "Kairo" no WhatsApp → o
// modelo entra em LOOP de save_contact_name (tool SILENCIOSA — só grava no DB) até
// bater stepCountIs SEM gerar texto → o turno fecha mudo (textChars=0, hasSent=false).
// O web tinha o guard de turno-vazio (route.ts:1109), mas o `consumeEvents` do
// WhatsApp NÃO — o usuário ficava 27s no silêncio. Este teste trava que um turno de
// USUÁRIO sem NENHUMA emissão visível emite o EMPTY_TURN_FALLBACK honesto.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_TURN_FALLBACK } from "@/lib/chat/empty-turn-guard";

const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	runTurn: vi.fn(),
	getOrCreateConversation: vi.fn().mockResolvedValue({ id: "conv-fix172" }),
	reloadMeta: vi.fn().mockResolvedValue({}),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("./session", () => ({ getOrCreateConversation: mocks.getOrCreateConversation }));
vi.mock("@/lib/conversation/meta", () => ({
	persistMeta: mocks.persistMeta,
	reloadMeta: mocks.reloadMeta,
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({ recordStageReached: mocks.recordStageReached }));
// traceTurnEvents = tap passthrough (a telemetria real iria ao DB/log; aqui só repassa).
vi.mock("@/lib/telemetry/turn-trace", () => ({
	traceTurnEvents: (events: AsyncIterable<unknown>) => events,
}));
vi.mock("@/lib/agent/orchestrator", async (orig) => ({
	...(await (orig() as Promise<Record<string, unknown>>)),
	runTurn: mocks.runTurn,
}));

import { processWithOrchestrator } from "./adapter";

// Turno MUDO: só tool-call silenciosa (save_contact_name) em loop + finish — 0 texto, 0 artifact.
async function* muteTurn() {
	yield { type: "tool-call", toolName: "save_contact_name" } as never;
	yield { type: "tool-call", toolName: "save_contact_name" } as never;
	yield { type: "finish" } as never;
}
// Turno FALANTE: o agente responde com texto (caso normal).
async function* speakingTurn() {
	yield { type: "text-delta", text: "Oi Kairo! Prazer." } as never;
	yield { type: "finish" } as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getOrCreateConversation.mockResolvedValue({ id: "conv-fix172" });
	mocks.reloadMeta.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("FIX-172 — guard de turno-mudo no WhatsApp (agente mudo ao receber o nome)", () => {
	it("turno de usuário MUDO (loop de save_contact_name, 0 texto) => emite o fallback, não silêncio", async () => {
		mocks.runTurn.mockReturnValue(muteTurn());
		await processWithOrchestrator(WA, "Kairo", undefined);
		// o usuário recebe o fallback honesto em vez de 27s de silêncio
		expect(mocks.sendText).toHaveBeenCalledWith(WA, EMPTY_TURN_FALLBACK);
	});

	it("turno com texto NÃO dispara o fallback (sem resposta duplicada)", async () => {
		mocks.runTurn.mockReturnValue(speakingTurn());
		await processWithOrchestrator(WA, "Kairo", undefined);
		const fallbacks = mocks.sendText.mock.calls.filter((c) => c[1] === EMPTY_TURN_FALLBACK);
		expect(fallbacks).toHaveLength(0);
		// e o texto real do agente foi enviado
		expect(mocks.sendText).toHaveBeenCalledWith(WA, expect.stringContaining("Kairo"));
	});
});
