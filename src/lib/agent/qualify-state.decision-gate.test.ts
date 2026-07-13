import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate, nextGate } from "./qualify-state";

// ============================================================================
// Camada 1 — gate "decision" (fim do passo 4 da jornada.docx → passo 5)
// ----------------------------------------------------------------------------
// BUG-REVEAL-LOOP (reportado por Kairo, print 2026-06-02, persona Rafael/auto):
// depois do reveal (comparison_table + recommendation_card + simulation_result),
// a cada afirmativo do usuário ("bora", "ta otimo") o agente RE-DISPARAVA o
// reveal inteiro (loop nos cards mockados antigos) e NUNCA cruzava pro
// present_decision_prompt ("Esse plano faz sentido?") → passo 5 (contratar).
// "Não tá puxando da plataforma nova."
//
// Causa-raiz: a máquina de funil terminava em "search". Não havia gate/directive
// que avançasse a jornada pro card de decisão. O modelo preenchia o vazio
// re-apresentando.
//
// Fix (espelha o padrão searchDispatched): gate "decision" disparado pelo
// orquestrador pós-reveal, guardado por decisionDispatched (idempotente).
// Estas funções são PURAS — TDD cirúrgico.
// ============================================================================

// Meta de uma conversa que JÁ completou a qualificação + o reveal:
// nome capturado, 4 dados respondidos, busca disparada, simulação mostrada.
function postRevealMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		desireAsked: true,
		currentPersona: "rafael-auto",
		currentCategory: "auto",
		experiencePrev: "first",
		qualifyConsented: true,
		qualifyAnswers: {
			creditMin: 90_000,
			creditMax: 100_000,
			monthlyBudget: 1_600,
			prazoMeses: 0,
			objetivo: "contemplacao_rapida",
			hasLance: "yes",
			lanceValue: 30_000,
			lanceEmbutido: true,
			lanceEmbutidoPercent: 30,
		},
		// D1 (gate identify): pós-busca implica identidade coletada — sem ela a
		// busca nem teria liberado (tripwire). Suite do identify é separada.
		identityCollected: true,
		searchDispatched: true,
		revealCompleted: true,
		// FIX-297: reco-consent precisa estar resolvido pra nextGate cruzar até
		// o decision (senão insere "reco-consent" bem antes).
		recoConsentDispatched: true,
		// docx passo 4: oferta do simulador já feita (suite própria em
		// qualify-state.simulator-offer.test.ts) — aqui testamos SÓ o decision.
		simulatorOfferDispatched: true,
		...over,
	};
}

describe("nextGate — avanço pro card de decisão pós-reveal", () => {
	it("retorna 'decision' quando reveal completou e a decisão ainda não foi disparada", () => {
		const meta = postRevealMeta();
		expect(nextGate(meta, { hasContactName: true })).toBe("decision");
	});

	it("NÃO retorna 'decision' antes do reveal completar (ainda não viu a simulação)", () => {
		const meta = postRevealMeta({ revealCompleted: false });
		// Antes de o reveal completar, a busca já foi disparada → terminal "search"
		// (guardado por searchDispatched no orquestrador). Nunca "decision".
		expect(nextGate(meta, { hasContactName: true })).not.toBe("decision");
	});

	it("NÃO retorna 'decision' depois que a decisão já foi disparada (idempotência)", () => {
		const meta = postRevealMeta({ decisionDispatched: true });
		expect(nextGate(meta, { hasContactName: true })).not.toBe("decision");
	});

	it("não interfere na coleta: enquanto faltar busca/reveal, nunca retorna 'decision'", () => {
		// FIX-215 (Ata 2026-07-04): lance saiu da entrada — sem revealCompleted,
		// o gate é "search" (busca direto após o valor), mesmo com hasLance já
		// respondido (dado que só importa DEPOIS do reveal).
		const meta = postRevealMeta({
			searchDispatched: false,
			revealCompleted: false,
			qualifyAnswers: { creditMax: 100_000, hasLance: "yes" },
		});
		const g = nextGate(meta, { hasContactName: true });
		expect(g).not.toBe("decision");
		expect(g).toBe("search");
	});

	it("FIX-215: pós-reveal com hasLance='yes' sem valor → 'lance-value', nunca 'decision'", () => {
		const meta = postRevealMeta({
			qualifyAnswers: { creditMax: 100_000, prazoMeses: 0, hasLance: "yes" },
		});
		const g = nextGate(meta, { hasContactName: true });
		expect(g).not.toBe("decision");
		expect(g).toBe("lance-value");
	});
});

describe("decideShowGate — quando disparar o card de decisão", () => {
	const base = postRevealMeta();

	it("dispara em afirmativo forte ('bora' → ready_to_proceed)", () => {
		expect(
			decideShowGate({
				gate: "decision",
				intent: "ready_to_proceed",
				meta: base,
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("dispara em afirmativo neutro ('ta otimo' → neutral)", () => {
		// O print do bug tinha "ta otimo" repetidamente — o analyzer classifica
		// como neutral. Tem que avançar mesmo assim.
		expect(
			decideShowGate({ gate: "decision", intent: "neutral", meta: base, isUserTurn: true }),
		).toBe(true);
	});

	it("NÃO dispara em what-if ('e se fosse 1500/mês' → providing_info) — deixa re-simular", () => {
		expect(
			decideShowGate({ gate: "decision", intent: "providing_info", meta: base, isUserTurn: true }),
		).toBe(false);
	});

	it("NÃO dispara em pergunta ('como funciona o lance?' → asking_question)", () => {
		expect(
			decideShowGate({ gate: "decision", intent: "asking_question", meta: base, isUserTurn: true }),
		).toBe(false);
	});

	it("NÃO dispara em dúvida (expressing_doubt) nem off_topic", () => {
		expect(
			decideShowGate({
				gate: "decision",
				intent: "expressing_doubt",
				meta: base,
				isUserTurn: true,
			}),
		).toBe(false);
		expect(
			decideShowGate({ gate: "decision", intent: "off_topic", meta: base, isUserTurn: true }),
		).toBe(false);
	});

	it("turno autoral do servidor (directive, !isUserTurn) sempre mostra o gate", () => {
		expect(
			decideShowGate({ gate: "decision", intent: "neutral", meta: base, isUserTurn: false }),
		).toBe(true);
	});
});
