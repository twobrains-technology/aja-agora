// Camada 1 (FIX-211) — cobrança do gate obrigatório pendente.
//
// Kairo: "se o cara nao informar tem que cobrar ele ate informar".
//
// REVISADO em 2026-07-20 (auditoria multicanal): a cobrança vale pro turno MUDO
// (nada saiu — rede de segurança legítima, nunca deixar o cliente no silêncio).
// O ramo que colava a cobrança enlatada no fim de um turno que JÁ TINHA FALADO
// foi removido: o cliente perguntava "consórcio tem juros?", o modelo explicava
// bem, e logo abaixo chegava "Só falta isso pra eu seguir — é rapidinho." A web
// nunca fez isso e a mesma conversa flui natural lá. Retomar o assunto pendente
// é do CÉREBRO (o `systemContext` informa o gate pendente como INTENÇÃO e o
// modelo retoma com as palavras dele), não do canal por texto fixo.

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

// meta onde o funil está TRAVADO no gate identify (consent dado, valor já
// coletado, sem identidade). FIX-296 (rodada 10): credit precede identify —
// pra nextGate chegar genuinamente em identify, o valor já precisa constar.
function identifyPendingMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		currentCategory: "auto",
		currentPersona: "helena-auto",
		experiencePrev: "returning",
		qualifyConsented: true,
		qualifyAnswers: { creditMax: 80_000 },
		...over,
	} as ConversationMetadata;
}

beforeEach(() => {
	for (const m of [mocks.sendText, mocks.sendInteractive, mocks.persistMeta]) m.mockClear();
	mocks.getOrCreateConversation.mockResolvedValue({ id: CONV_ID });
});

afterEach(() => vi.clearAllMocks());

describe("FIX-211 — cobrança do gate obrigatório é do turno MUDO, nunca colada num turno que falou", () => {
	it("usuário desvia no identify e o MODELO responde → a resposta dele é a única fala do turno (sem cobrança colada)", async () => {
		mocks.reloadMeta.mockResolvedValue(identifyPendingMeta());
		// o LLM RESPONDE a dúvida (turno NÃO fecha mudo) mas NÃO dispara o gate identify.
		const respostaDoModelo = "Boa pergunta! O CPF serve pra liberar as simulações reais.";
		mocks.runTurn.mockReturnValue(
			emit([
				{ type: "text-delta", text: respostaDoModelo },
				{ type: "finish", reason: "ok" },
			]),
		);

		await processWithOrchestrator(WA, "por que você precisa do meu CPF?");

		const textos = mocks.sendText.mock.calls.map((c) => c[1] as string);
		// a resposta do modelo saiu…
		expect(textos).toContain(respostaDoModelo);
		// …e NADA foi colado depois dela (nada de "Só falta isso pra eu seguir").
		expect(textos).toHaveLength(1);
		// o contador de cobranças NÃO é incrementado por um turno que falou
		const persistedCalls = mocks.persistMeta.mock.calls.map((c) => c[1] as ConversationMetadata);
		expect(persistedCalls.every((m) => m.gateAttempts === undefined)).toBe(true);
	});

	it("turno MUDO segue coberto: re-cobra o gate e, no teto, oferece o especialista", async () => {
		// já houve 3 cobranças — o contador está em 3; este é o 4º turno mudo.
		mocks.reloadMeta.mockResolvedValue(identifyPendingMeta({ gateAttempts: { identify: 3 } }));
		mocks.runTurn.mockReturnValue(emit([{ type: "finish", reason: "ok" }]));

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
