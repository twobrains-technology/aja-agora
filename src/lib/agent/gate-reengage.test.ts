import { describe, expect, it } from "vitest";
import {
	GATE_REENGAGE_TIMEOUT_MS,
	isConversationPausedOrTerminal,
	pendingGateAfterTurn,
	shouldReengageGate,
} from "./gate-reengage";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

// ============================================================================
// FIX-207 — Camada 1 (decisão pura do watchdog de inatividade)
// ----------------------------------------------------------------------------
// Rede de segurança pra CAUDA não-determinística do FIX-206: quando o LLM
// classifica um turno de texto como dúvida/pergunta, decideShowGate suprime o
// gate LEGITIMAMENTE e o consent já foi ofertado — o funil fica parado se o
// usuário some. O watchdog re-engaja passado um teto de inatividade.
//
// Espelha isStreamStuck (stream-watchdog.ts): decisão PURA (timestamps + estado)
// testável fora do worker. O worker (gate-reengage-poll) só arma o ciclo.
// ============================================================================

function qualifyingMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentPersona: "helena-imovel",
		currentCategory: "imovel",
		experiencePrev: "doubts",
		doubtsAddressed: true,
		// consent já ofertado → nextGate cai em doubts-wait quando o usuário só
		// tira dúvidas; mas ainda há um gate real pendente (consent) suprimido.
		...over,
	};
}

const T0 = 1_800_000_000_000; // epoch ms fixo (determinístico, sem Date.now())

describe("FIX-207 shouldReengageGate — decide re-engajar por inatividade", () => {
	it("ABAIXO do teto: NÃO re-engaja (usuário pode estar digitando)", () => {
		expect(
			shouldReengageGate({
				meta: qualifyingMeta(),
				pendingGateSince: T0,
				now: T0 + GATE_REENGAGE_TIMEOUT_MS - 1,
			}),
		).toBe(false);
	});

	it("no LIMITE do teto: re-engaja", () => {
		expect(
			shouldReengageGate({
				meta: qualifyingMeta(),
				pendingGateSince: T0,
				now: T0 + GATE_REENGAGE_TIMEOUT_MS,
			}),
		).toBe(true);
	});

	it("ACIMA do teto: re-engaja", () => {
		expect(
			shouldReengageGate({
				meta: qualifyingMeta(),
				pendingGateSince: T0,
				now: T0 + GATE_REENGAGE_TIMEOUT_MS + 60_000,
			}),
		).toBe(true);
	});

	it("sem pendingGateSince: nunca re-engaja (não há pendência)", () => {
		expect(
			shouldReengageGate({
				meta: qualifyingMeta(),
				pendingGateSince: undefined,
				now: T0 + 10 * GATE_REENGAGE_TIMEOUT_MS,
			}),
		).toBe(false);
	});

	it("handoff humano pendente: NUNCA re-engaja (o relay conduz)", () => {
		expect(
			shouldReengageGate({
				meta: qualifyingMeta({ handoffSuggested: true }),
				pendingGateSince: T0,
				now: T0 + GATE_REENGAGE_TIMEOUT_MS + 60_000,
			}),
		).toBe(false);
	});

	it("fechamento concluído (contractClosed): NUNCA re-engaja", () => {
		expect(
			shouldReengageGate({
				meta: qualifyingMeta({ contractClosed: true }),
				pendingGateSince: T0,
				now: T0 + GATE_REENGAGE_TIMEOUT_MS + 60_000,
			}),
		).toBe(false);
	});

	it("coleta de lead ativa: NUNCA re-engaja (outro fluxo dirige)", () => {
		expect(
			shouldReengageGate({
				meta: qualifyingMeta({ leadCollection: { stage: "phone" } }),
				pendingGateSince: T0,
				now: T0 + GATE_REENGAGE_TIMEOUT_MS + 60_000,
			}),
		).toBe(false);
	});

	it("teto configurável por argumento (espelha STREAM_STALL_TIMEOUT_MS)", () => {
		expect(
			shouldReengageGate({
				meta: qualifyingMeta(),
				pendingGateSince: T0,
				now: T0 + 5_000,
				timeoutMs: 5_000,
			}),
		).toBe(true);
		expect(
			shouldReengageGate({
				meta: qualifyingMeta(),
				pendingGateSince: T0,
				now: T0 + 4_999,
				timeoutMs: 5_000,
			}),
		).toBe(false);
	});
});

describe("FIX-207 isConversationPausedOrTerminal — estados onde o funil não re-abre", () => {
	it("qualificação ativa: NÃO é terminal", () => {
		expect(isConversationPausedOrTerminal(qualifyingMeta())).toBe(false);
	});
	it("handoff / fechado / lead: terminal/pausado", () => {
		expect(isConversationPausedOrTerminal(qualifyingMeta({ handoffSuggested: true }))).toBe(true);
		expect(isConversationPausedOrTerminal(qualifyingMeta({ contractClosed: true }))).toBe(true);
		expect(
			isConversationPausedOrTerminal(qualifyingMeta({ leadCollection: { stage: "name" } })),
		).toBe(true);
	});
});

describe("FIX-207 pendingGateAfterTurn — marca a pendência só quando faz sentido", () => {
	// Estado onde um gate REAL (consent) ficou pendente após uma pergunta do
	// usuário (asking_question suprimiu). O funil não fechou o consent ainda.
	function suppressedConsentMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
		return {
			currentPersona: "helena-imovel",
			currentCategory: "imovel",
			experiencePrev: "first",
			// consent ainda não aceito → nextGate = consent
			...over,
		};
	}

	it("turno de usuário sem gate disparado + gate real pendente → marca o gate", () => {
		expect(
			pendingGateAfterTurn({
				meta: suppressedConsentMeta(),
				gateFired: false,
				isUserTurn: true,
				hasContactName: true,
			}),
		).toBe("consent");
	});

	it("gate DISPARADO neste turno → não há pendência (null)", () => {
		expect(
			pendingGateAfterTurn({
				meta: suppressedConsentMeta(),
				gateFired: true,
				isUserTurn: true,
				hasContactName: true,
			}),
		).toBeNull();
	});

	it("turno server-authored → null (server-authored já avança, FIX-206)", () => {
		expect(
			pendingGateAfterTurn({
				meta: suppressedConsentMeta(),
				gateFired: false,
				isUserTurn: false,
				hasContactName: true,
			}),
		).toBeNull();
	});

	it("estado terminal (handoff) → null mesmo com gate pendente", () => {
		expect(
			pendingGateAfterTurn({
				meta: suppressedConsentMeta({ handoffSuggested: true }),
				gateFired: false,
				isUserTurn: true,
				hasContactName: true,
			}),
		).toBeNull();
	});

	it("nextGate=doubts-wait (espera legítima: agente perguntou) → null", () => {
		// consent já ofertado + dúvida em aberto → nextGate=doubts-wait: o agente
		// tem gancho conversacional, não é uma trava de gate.
		const meta = suppressedConsentMeta({ consentOffered: true, pendingFollowUp: true });
		expect(
			pendingGateAfterTurn({ meta, gateFired: false, isUserTurn: true, hasContactName: true }),
		).toBeNull();
	});

	it("nextGate=search (terminal, orquestrador conduz) → null", () => {
		// Qualificação completa → nextGate=search (todos os gates respondidos).
		const meta = suppressedConsentMeta({
			qualifyConsented: true,
			identityCollected: true,
			qualifyAnswers: {
				creditMax: 300_000,
				hasLance: "no",
				lanceEmbutido: false,
			},
		});
		expect(nextGate(meta, { hasContactName: true })).toBe("search");
		expect(
			pendingGateAfterTurn({ meta, gateFired: false, isUserTurn: true, hasContactName: true }),
		).toBeNull();
	});
});
