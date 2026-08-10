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
	reengageQuestionForGate: vi.fn(),
	// Preenchido pelo factory do `vi.mock` abaixo (que roda hoisted, antes de
	// qualquer `let` no corpo do módulo — daí morar aqui dentro).
	reengageReal: null as unknown as (...a: unknown[]) => string | null,
}));

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
// Spy sobre o reengage REAL: por padrão delega ao original (o degrau preferido
// é exercitado de verdade); só o caso da rede final o força a devolver null.
vi.mock("@/lib/agent/gate-reengage", async (orig) => {
	const real = (await orig()) as Record<string, unknown>;
	mocks.reengageReal = real.reengageQuestionForGate as (...a: unknown[]) => string | null;
	return { ...real, reengageQuestionForGate: mocks.reengageQuestionForGate };
});

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
	// Re-arma o passthrough a CADA teste: sem isto o caso da rede final (que
	// força `null`) vazaria a implementação pros seguintes e a suíte passaria a
	// depender da ordem de execução.
	mocks.reengageQuestionForGate.mockImplementation((...a: unknown[]) => mocks.reengageReal(...a));
});
afterEach(() => vi.clearAllMocks());

describe("FIX-172 — guard de turno-mudo no WhatsApp (agente mudo ao receber o nome)", () => {
	it("turno de usuário MUDO (loop de save_contact_name, 0 texto) => o usuário recebe algo, não silêncio", async () => {
		mocks.runTurn.mockReturnValue(muteTurn());
		await processWithOrchestrator(WA, "Kairo", undefined);

		// O INVARIANTE do FIX-172: nunca 27s de silêncio. QUAL frase sai é o
		// degrau do guard (asserido nos dois casos abaixo), não o invariante.
		expect(mocks.sendText, "turno mudo tem que emitir ALGUMA coisa").toHaveBeenCalled();
		const enviado = mocks.sendText.mock.calls.map((c) => c[1] as string).join(" | ");
		expect(enviado.trim().length, "a mensagem não pode ser vazia").toBeGreaterThan(0);
	});

	// 2026-08-05 — o degrau PREFERIDO passou a valer também pro `desire`.
	// `adapter.ts:574-591` sempre preferiu re-cobrar o gate pendente ao invés do
	// "me perdi" ("Re-cobra o gate de coleta pendente em vez do 'me perdi';
	// demais gates caem no fallback honesto"), e o FIX-351 generalizou pra
	// "QUALQUER gate com pergunta própria é reengajável" — citando `desire`
	// entre os que devolviam null. Mas `gateQuestion("desire", null)` continuava
	// null sem categoria, então o `desire` seguia caindo no "me perdi". Com a
	// pergunta de abertura (`DESIRE_ABERTURA`), o guard finalmente sobe de degrau
	// no estado de PRIMEIRO CONTATO — que é o `reloadMeta` vazio deste teste.
	it("turno mudo com gate reengajável => re-pergunta que CONDUZ, não 'me perdi'", async () => {
		mocks.runTurn.mockReturnValue(muteTurn());
		await processWithOrchestrator(WA, "Kairo", undefined);

		const enviado = mocks.sendText.mock.calls.map((c) => c[1] as string).join(" | ");
		expect(enviado).not.toBe(EMPTY_TURN_FALLBACK);
		expect(enviado, "a re-cobrança tem que perguntar algo que move o funil").toMatch(
			/carro|moto|im[óo]vel/i,
		);
	});

	it("sem gate reengajável, a rede final ('me perdi') continua ligada", async () => {
		// O último recurso não pode ter sido desligado pelo degrau novo: com o
		// reengage devolvendo null (gate sem pergunta própria, ex.: `name`), o
		// fallback honesto segue sendo o que sai.
		mocks.reengageQuestionForGate.mockReturnValue(null);
		mocks.runTurn.mockReturnValue(muteTurn());
		await processWithOrchestrator(WA, "Kairo", undefined);

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
