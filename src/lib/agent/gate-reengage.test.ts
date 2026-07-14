import { describe, expect, it } from "vitest";
import {
	GATE_REENGAGE_TIMEOUT_MS,
	isConversationPausedOrTerminal,
	pendingGateAfterTurn,
	reengageQuestionForGate,
	shouldReengageGate,
} from "./gate-reengage";
import { gateQuestion } from "./orchestrator/gate-questions";
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
	// Estado onde o 1º gate estrutural pós-desire (credit) ficou pendente após
	// uma pergunta do usuário (asking_question suprimiu). FIX-296: sem consent,
	// `credit` é o gate real pendente logo após o desire (reversão do FIX-53).
	function suppressedIdentifyMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
		return {
			desireAsked: true,
			currentPersona: "helena-imovel",
			currentCategory: "imovel",
			// valor ainda não coletado → nextGate = credit
			...over,
		};
	}

	it("turno de usuário sem gate disparado + gate real pendente → marca o gate", () => {
		expect(
			pendingGateAfterTurn({
				meta: suppressedIdentifyMeta(),
				gateFired: false,
				isUserTurn: true,
				hasContactName: true,
			}),
		).toBe("credit");
	});

	it("gate DISPARADO neste turno → não há pendência (null)", () => {
		expect(
			pendingGateAfterTurn({
				meta: suppressedIdentifyMeta(),
				gateFired: true,
				isUserTurn: true,
				hasContactName: true,
			}),
		).toBeNull();
	});

	it("turno server-authored → null (server-authored já avança, FIX-206)", () => {
		expect(
			pendingGateAfterTurn({
				meta: suppressedIdentifyMeta(),
				gateFired: false,
				isUserTurn: false,
				hasContactName: true,
			}),
		).toBeNull();
	});

	it("estado terminal (handoff) → null mesmo com gate pendente", () => {
		expect(
			pendingGateAfterTurn({
				meta: suppressedIdentifyMeta({ handoffSuggested: true }),
				gateFired: false,
				isUserTurn: true,
				hasContactName: true,
			}),
		).toBeNull();
	});

	it("nextGate=doubts-wait (espera legítima: agente perguntou) → null", () => {
		// pendingFollowUp em aberto → nextGate=doubts-wait: o agente tem gancho
		// conversacional, não é uma trava de gate.
		const meta = suppressedIdentifyMeta({ pendingFollowUp: true });
		expect(
			pendingGateAfterTurn({ meta, gateFired: false, isUserTurn: true, hasContactName: true }),
		).toBeNull();
	});

	it("nextGate=search (terminal, orquestrador conduz) → null", () => {
		// Qualificação completa → nextGate=search (todos os gates respondidos).
		const meta = suppressedIdentifyMeta({
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

// ============================================================================
// FIX-208 — Camada 1 (guard rede-final): quando o turno de usuário fecharia
// MUDO com um gate de qualify pendente, re-emite a PERGUNTA daquele gate em vez
// do EMPTY_TURN_FALLBACK ("Acho que me perdi..."). Cobre os 2 canais (o helper
// é puro; route.ts e whatsapp/adapter.ts o consomem no bloco guardEmptyTurn).
// ============================================================================
describe("FIX-208 reengageQuestionForGate — a re-pergunta do gate pendente, não 'me perdi'", () => {
	it("gate credit → re-emite a pergunta do valor do bem (o caso do bug)", () => {
		expect(reengageQuestionForGate("credit", "auto")).toBe(gateQuestion("credit", "auto"));
		expect(reengageQuestionForGate("credit", "auto")).toMatch(/valor do bem/i);
	});

	it("gates de COLETA (lance/lance-value/lance-embutido) têm re-pergunta", () => {
		for (const gate of ["lance", "lance-value", "lance-embutido"] as const) {
			expect(reengageQuestionForGate(gate, "auto")).toBe(gateQuestion(gate, "auto"));
			expect(reengageQuestionForGate(gate, "auto")).toBeTruthy();
		}
	});

	it("gate identify → re-emite a pergunta de CPF/celular (bug consent→identify no WhatsApp, 2026-07-02)", () => {
		// O bug: clicar "Bora!" (consent) levava o funil pro identify, que NÃO tinha
		// entrega no WhatsApp → turno mudo → silêncio (clique) ou "me perdi" (texto).
		// identify é entrega OBRIGATÓRIA: o guard re-pergunta o CPF, nunca "me perdi".
		expect(reengageQuestionForGate("identify", "auto")).toBe(gateQuestion("identify", "auto"));
		expect(reengageQuestionForGate("identify", "auto")).toMatch(/CPF/i);
	});

	it("gates SEM pergunta própria (name/search/decision/doubts-wait) → null", () => {
		// FIX-351: o critério mudou. Antes era "não é gate de coleta → null", e isso
		// fazia o turno vazio com `reco-consent`/`experience` pendente cair no "Acho
		// que me perdi" — com o usuário tendo respondido claramente. Agora o critério
		// é ter PERGUNTA: se o gate pergunta, o turno vazio re-pergunta.
		// Estes quatro não têm pergunta própria (gateQuestion devolve null).
		for (const gate of ["name", "search", "decision", "doubts-wait"] as const) {
			expect(reengageQuestionForGate(gate, "auto")).toBeNull();
		}
	});

	it("gate COM pergunta fora da coleta (experience) → re-pergunta, nunca null (FIX-351)", () => {
		expect(reengageQuestionForGate("experience", "auto")).toMatch(/já fez consórcio/i);
	});
});
