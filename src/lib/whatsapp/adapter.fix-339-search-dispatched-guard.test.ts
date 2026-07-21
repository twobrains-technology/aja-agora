// FIX-339 (bloco-c-whatsapp-invariantes) — turno morto pós-CPF (G1, veredito
// whatsapp rodada 1): `runSearchSummaryWithOrchestrator` marcava
// `searchDispatched: true` PREEMPTIVO, ANTES do directive de busca sequer
// rodar. Uma busca que falhasse/degradasse deixava a flag travada em `true`
// pra sempre — `nextGate()` nunca mais voltava pro gate "search" e o retry
// ficava impossível num turno seguinte (o mesmo padrão pré-FIX-291 já
// corrigido no canal web, src/lib/web/adapter.ts:562-577).
//
// Porte: `searchDispatched` só é persistido DEPOIS de confirmar
// `revealCompleted` (fato setado pelo runner só com artifacts REAIS na tela).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WA = "5562999887766";

const READY_META = {
	searchDispatched: false,
	identityCollected: true,
	currentCategory: "auto",
	currentPersona: "auto",
	qualifyAnswers: { creditMax: 100_000, prazoMeses: 12, hasLance: "no" },
};

const mocks = vi.hoisted(() => {
	let metaState: Record<string, unknown> = {};
	return {
		sendText: vi.fn().mockResolvedValue(undefined),
		sendInteractive: vi.fn().mockResolvedValue(undefined),
		runTurn: vi.fn(),
		recordStageReached: vi.fn().mockResolvedValue(undefined),
		reloadMeta: vi.fn(async () => ({ ...metaState })),
		persistMeta: vi.fn(async (_id: string, meta: Record<string, unknown>) => {
			metaState = meta;
		}),
		setMetaState: (patch: Record<string, unknown>) => {
			metaState = { ...metaState, ...patch };
		},
		getMetaState: () => metaState,
		resetMetaState: (init: Record<string, unknown>) => {
			metaState = { ...init };
		},
	};
});

// Idempotência do canal (src/lib/whatsapp/once.ts) fala com o Postgres — nos
// testes de unidade ela é sempre "pode" — o que se prova aqui é a ENTREGA, não a
// idempotência.
vi.mock("./once", () => ({
	claimOnce: vi.fn().mockResolvedValue(true),
	claimInboundMessage: vi.fn().mockResolvedValue(true),
	claimContextBeat: vi.fn().mockResolvedValue(true),
	claimButtonClick: vi.fn().mockResolvedValue(true),
	DOUBLE_CLICK_WINDOW_MS: 12000,
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

// Busca que COMPLETA de verdade — o runner real marcaria revealCompleted=true
// ao emitir os artifacts do reveal. Simulado aqui como side-effect do turno.
async function* successfulDiscovery() {
	mocks.setMetaState({ revealCompleted: true });
	yield { type: "text-delta", text: "Olha só o que encontrei na sua faixa:" } as never;
	yield { type: "finish", reason: "ok" } as never;
}

// Busca que FALHA/DEGRADA — revealCompleted nunca vira true (cap estourado,
// erro duro da Bevi etc.), mas o turno ainda fala alguma coisa.
async function* failedDiscovery() {
	yield { type: "text-delta", text: "Deixa eu tentar de novo em instantes." } as never;
	yield { type: "finish", reason: "ok" } as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.resetMetaState(READY_META);
});
afterEach(() => vi.clearAllMocks());

describe("FIX-339 — searchDispatched só marca DEPOIS de confirmar revealCompleted", () => {
	it("busca com sucesso (revealCompleted=true) → searchDispatched fica true", async () => {
		mocks.runTurn.mockReturnValue(successfulDiscovery());
		await runSearchSummaryWithOrchestrator({ from: WA, conversationId: "c1" });
		expect(mocks.getMetaState().searchDispatched).toBe(true);
	});

	it("busca falha/degrada (revealCompleted nunca vira true) → searchDispatched NÃO fica true, retry liberado", async () => {
		mocks.runTurn.mockReturnValue(failedDiscovery());
		await runSearchSummaryWithOrchestrator({ from: WA, conversationId: "c1" });
		expect(mocks.getMetaState().searchDispatched).not.toBe(true);
	});

	it("NUNCA marca searchDispatched ANTES do directive rodar (a marca preemptiva era o bug)", async () => {
		let dispatchedDuringTurn: boolean | undefined;
		async function* checkDuringTurn() {
			dispatchedDuringTurn = mocks.getMetaState().searchDispatched === true;
			mocks.setMetaState({ revealCompleted: true });
			yield { type: "text-delta", text: "Olha só o que encontrei." } as never;
			yield { type: "finish", reason: "ok" } as never;
		}
		mocks.runTurn.mockReturnValue(checkDuringTurn());
		await runSearchSummaryWithOrchestrator({ from: WA, conversationId: "c1" });
		expect(dispatchedDuringTurn).toBe(false);
	});
});
