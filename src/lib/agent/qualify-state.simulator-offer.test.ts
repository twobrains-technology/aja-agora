import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// Gate "simulator-offer" — docx passo 4 (linha 34-36): após apresentar o plano,
// o agente OFERECE o simulador: "Se quiser, temos o nosso simulador para ver
// como ficariam as suas parcelas, caso seja contemplado em 3, 6 ou 12 meses,
// que tal?". Auditoria 2026-06-04: o simulador-agulha (conceito do Bernardo)
// existia mas só disparava a critério do modelo — fora do caminho padrão.
// A oferta agora é DETERMINÍSTICA, entre o reveal e o card de decisão.

function postReveal(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		currentCategory: "auto",
		experiencePrev: "first",
		qualifyConsented: true,
		identityCollected: true,
		qualifyAnswers: {
			creditMax: 100_000,
			prazoMeses: 0,
			hasLance: "yes",
			lanceValue: 30_000,
			lanceEmbutido: true,
		},
		searchDispatched: true,
		revealCompleted: true,
		recommendedAdministradora: "ITAÚ",
		...over,
	};
}

describe("nextGate — oferta do simulador entre o reveal e a decisão (docx passo 4)", () => {
	it("pós-reveal SEM oferta feita → simulator-offer (antes do decision)", () => {
		expect(nextGate(postReveal(), { hasContactName: true })).toBe("simulator-offer");
	});

	it("oferta já feita → decision (ordem do docx: simulador, depois 'faz sentido?')", () => {
		expect(nextGate(postReveal({ simulatorOfferDispatched: true }), { hasContactName: true })).toBe(
			"decision",
		);
	});

	it("antes do reveal completar, NUNCA oferece simulador", () => {
		expect(nextGate(postReveal({ revealCompleted: false }), { hasContactName: true })).not.toBe(
			"simulator-offer",
		);
	});

	it("decision continua idempotente depois da cadeia completa", () => {
		expect(
			nextGate(postReveal({ simulatorOfferDispatched: true, decisionDispatched: true }), {
				hasContactName: true,
			}),
		).not.toBe("decision");
	});
});

describe("decideShowGate — simulator-offer", () => {
	it("dispara no turno autoral do servidor (na sequência do reveal, como o docx)", () => {
		expect(
			decideShowGate({
				gate: "simulator-offer",
				intent: "neutral",
				meta: postReveal(),
				isUserTurn: false,
			}),
		).toBe(true);
	});

	it("em turno do usuário, dispara em afirmativo (ready/neutral) e não em pergunta", () => {
		expect(
			decideShowGate({
				gate: "simulator-offer",
				intent: "ready_to_proceed",
				meta: postReveal(),
				isUserTurn: true,
			}),
		).toBe(true);
		expect(
			decideShowGate({
				gate: "simulator-offer",
				intent: "asking_question",
				meta: postReveal(),
				isUserTurn: true,
			}),
		).toBe(false);
	});
});
