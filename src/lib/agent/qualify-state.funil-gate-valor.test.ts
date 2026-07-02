import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, type Gate } from "./qualify-state";

// ============================================================================
// FIX-208 — Camada 1 (estrutural): responder DIRETO um gate de COLETA não pode
// fechar o turno mudo, mesmo quando o analyzer classifica a mensagem como
// `neutral`.
// ----------------------------------------------------------------------------
// Bug (Kairo, WhatsApp PROD 2026-07-02): "Quanto custa o carro?" → usuário
// responde "200" (ou "200 mil reais") → o agente cai no EMPTY_TURN_FALLBACK
// ("Acho que me perdi por aqui..."). Mesma CLASSE do FIX-206 (o funil suprime o
// gate contando com o próximo turno do usuário e fecha mudo), mas no gate de
// VALOR em turno de USUÁRIO — que o FIX-206 não cobriu.
//
// Root cause em decideShowGate: com `experiencePrev`/qualify já setados,
// `hasNoQualifyData=false` → o heurístico "neutral → fica conversacional"
// SUPRIME o gate de coleta. Mas o analyzer é NÃO-confiável (timeout de
// cold-start → NEUTRAL_FALLBACK); um número/afirmativo respondido AO gate de
// coleta classificado como neutral não pode virar silêncio.
//
// Fix (Lei 4 — invariante em CÓDIGO, não regra-no-prompt): durante a coleta
// ativa, responder um gate de COLETA (credit/lance/lance-value/lance-embutido)
// dispara o gate — o "neutral → conversacional" vale PÓS-reveal, não na coleta.
// Perguntas/dúvidas/off-topic seguem deixando o agente conversar.
// ============================================================================

const COLLECTION_GATES: Gate[] = ["credit", "lance", "lance-value", "lance-embutido"];

/** Estado com a pré-qualificação feita — o funil está na coleta ativa e
 * `hasNoQualifyData` é FALSE (o gatilho do bug: neutral cairia em conversacional). */
function collectingMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentPersona: "helena-auto",
		currentCategory: "auto",
		experiencePrev: "first",
		qualifyConsented: true,
		identityCollected: true,
		qualifyAnswers: { creditMax: 200_000 },
		...over,
	};
}

describe("FIX-208 decideShowGate — gate de COLETA respondido em turno de usuário dispara mesmo em `neutral`", () => {
	for (const gate of COLLECTION_GATES) {
		it(`gate '${gate}' + intent neutral + isUserTurn → dispara (não fecha mudo)`, () => {
			expect(
				decideShowGate({ gate, intent: "neutral", meta: collectingMeta(), isUserTurn: true }),
			).toBe(true);
		});
	}

	it("o CASO do bug: gate credit + neutral + coleta em curso → true (antes era false)", () => {
		// creditMax ainda ausente (o valor é justamente o que está sendo coletado).
		const meta = collectingMeta({ qualifyAnswers: {} });
		expect(decideShowGate({ gate: "credit", intent: "neutral", meta, isUserTurn: true })).toBe(
			true,
		);
	});
});

describe("FIX-208 decideShowGate — perguntas/dúvidas/off-topic ainda deixam o agente conversar", () => {
	for (const intent of ["asking_question", "expressing_doubt", "off_topic"] as const) {
		it(`gate credit + intent ${intent} → NÃO dispara (o usuário desviou; agente responde)`, () => {
			expect(
				decideShowGate({ gate: "credit", intent, meta: collectingMeta(), isUserTurn: true }),
			).toBe(false);
		});
	}

	it("regressão FIX-183: gate de coleta + wants_more_options → NÃO dispara", () => {
		expect(
			decideShowGate({
				gate: "credit",
				intent: "wants_more_options",
				meta: collectingMeta(),
				isUserTurn: true,
			}),
		).toBe(false);
	});
});

describe("FIX-208 decideShowGate — não regride comportamentos existentes", () => {
	it("providing_info num gate de coleta segue disparando (comportamento antigo)", () => {
		expect(
			decideShowGate({
				gate: "credit",
				intent: "providing_info",
				meta: collectingMeta(),
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("não-regressão FIX-206: gate de coleta server-authored (isUserTurn=false) segue true", () => {
		expect(
			decideShowGate({
				gate: "credit",
				intent: "neutral",
				meta: collectingMeta(),
				isUserTurn: false,
			}),
		).toBe(true);
	});

	it("não interfere em gates NÃO-coleta: 'decision' segue a regra antiga (neutral acolhe pós-reveal)", () => {
		const meta = collectingMeta({ revealCompleted: true });
		expect(decideShowGate({ gate: "decision", intent: "neutral", meta, isUserTurn: true })).toBe(
			true,
		);
		expect(
			decideShowGate({ gate: "decision", intent: "asking_question", meta, isUserTurn: true }),
		).toBe(false);
	});

	it("não interfere no gate 'search' (ação invasiva) — neutral segue suprimido", () => {
		const meta = collectingMeta({ revealCompleted: false });
		expect(decideShowGate({ gate: "search", intent: "neutral", meta, isUserTurn: true })).toBe(
			false,
		);
	});
});
