// Camada 1 (FIX-211) — cobrança quando o usuário DESVIA de um gate obrigatório.
//
// Kairo: "se o cara nao informar tem que cobrar ele ate informar". Antes só havia
// re-pergunta quando o turno fechava MUDO (guard) ou após 90s (watchdog). Se o
// usuário DESVIA (pergunta outra coisa, o LLM responde, o turno NÃO fecha mudo), o
// pedido do CPF/valor sumia e a conversa seguia sem o dado. Aqui: o adapter, ao
// fim do turno de usuário, re-cobra ESCALADO o gate obrigatório pendente — com
// teto de 3 tentativas + saída pro especialista (anti-armadilha).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPECIALIST_EXIT_OFFER } from "@/lib/agent/gate-reengage";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";

const CONV_ID = "conv-escada-211";
const WA = "5562999887766";

const mocks = vi.hoisted(() => ({
	sendText: vi.fn().mockResolvedValue(undefined),
	sendInteractive: vi.fn().mockResolvedValue(undefined),
	reloadMeta: vi.fn(),
	persistMeta: vi.fn().mockResolvedValue(undefined),
	getOrCreateConversation: vi.fn(),
	runTurn: vi.fn(),
}));

vi.mock("./api", () => ({
	sendTextMessage: mocks.sendText,
	sendInteractiveMessage: mocks.sendInteractive,
}));
vi.mock("./session", () => ({ getOrCreateConversation: mocks.getOrCreateConversation }));
vi.mock("@/lib/conversation/meta", () => ({
	reloadMeta: mocks.reloadMeta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/lib/agent/orchestrator", () => ({ runTurn: mocks.runTurn }));
vi.mock("@/lib/telemetry/turn-trace", () => ({
	traceTurnEvents: (events: AsyncIterable<TurnEvent>) => events,
}));
vi.mock("@/lib/admin/lead-stage-tracker", () => ({
	recordStageReached: vi.fn().mockResolvedValue(undefined),
}));

import { processWithOrchestrator } from "./adapter";

async function* emit(events: TurnEvent[]): AsyncGenerator<TurnEvent> {
	for (const ev of events) yield ev;
}

// meta onde o funil está TRAVADO no gate identify (consent dado, sem identidade).
function identifyPendingMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentCategory: "auto",
		currentPersona: "helena-auto",
		experiencePrev: "returning",
		qualifyConsented: true,
		...over,
	} as ConversationMetadata;
}

beforeEach(() => {
	for (const m of [mocks.sendText, mocks.sendInteractive, mocks.persistMeta]) m.mockClear();
	mocks.getOrCreateConversation.mockResolvedValue({ id: CONV_ID });
});

afterEach(() => vi.clearAllMocks());

describe("FIX-211 — desvio num gate obrigatório re-cobra ESCALADO (não segue sem o dado)", () => {
	it("usuário desvia no identify (LLM responde, sem gate) → re-cobra o CPF ao fim do turno", async () => {
		mocks.reloadMeta.mockResolvedValue(identifyPendingMeta());
		// o LLM RESPONDE a dúvida (turno NÃO fecha mudo) mas NÃO dispara o gate identify.
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "text-delta", text: "Boa pergunta! O CPF serve pra liberar as simulações reais." },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "por que você precisa do meu CPF?");

		// a resposta à dúvida saiu E o pedido do CPF é re-cobrado como beat próprio
		const textos = mocks.sendText.mock.calls.map((c) => c[1] as string);
		expect(textos.some((t) => /CPF/i.test(t))).toBe(true);
		// o contador de tentativas do gate foi incrementado (persistido)
		expect(mocks.persistMeta).toHaveBeenCalled();
		const persisted = mocks.persistMeta.mock.calls.at(-1)?.[1] as ConversationMetadata;
		expect(persisted.gateAttempts?.identify).toBe(1);
	});

	it("na 4ª cobrança oferece o especialista (saída), não re-pergunta o CPF", async () => {
		// já houve 3 desvios — o contador está em 3; este é o 4º.
		mocks.reloadMeta.mockResolvedValue(identifyPendingMeta({ gateAttempts: { identify: 3 } }));
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "text-delta", text: "Entendo a preocupação." },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "ainda não quero passar meu CPF");

		const textos = mocks.sendText.mock.calls.map((c) => c[1] as string);
		expect(textos).toContain(SPECIALIST_EXIT_OFFER);
	});

	it("gate NÃO obrigatório pendente (experience) → NÃO re-cobra (só coleta obrigatória)", async () => {
		mocks.reloadMeta.mockResolvedValue({
			currentCategory: "auto",
			currentPersona: "helena-auto",
		} as ConversationMetadata);
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "text-delta", text: "Legal, carro é um bom sonho!" },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "quero um carro");

		// nenhum incremento de gateAttempts pra gate não-obrigatório
		const persistedCalls = mocks.persistMeta.mock.calls.map((c) => c[1] as ConversationMetadata);
		expect(persistedCalls.every((m) => m.gateAttempts === undefined)).toBe(true);
	});

	it("gate obrigatório FOI disparado no turno → NÃO re-cobra (não é desvio)", async () => {
		mocks.reloadMeta.mockResolvedValue(identifyPendingMeta());
		// o gate identify DISPAROU neste turno (consent→identify) — não é desvio.
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "gate", gate: "identify" },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "Bora!");

		// gateAttempts NÃO incrementa quando o gate acabou de sair
		const persistedCalls = mocks.persistMeta.mock.calls.map((c) => c[1] as ConversationMetadata);
		expect(persistedCalls.every((m) => m.gateAttempts === undefined)).toBe(true);
	});
});
