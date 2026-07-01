import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { decideShowGate } from "./qualify-state";

// ============================================================================
// FIX-183 (Mirella, PROD conv 69a38af1, 2026-07-01) — Camada 1 (roteamento)
// ----------------------------------------------------------------------------
// O intent "wants_more_options" ("quero ver todos/mais opções") NUNCA pode
// empurrar o funil pra frente (decisão/simulação/busca): o usuário quer VER MAIS
// do que já foi mostrado, não avançar sobre um grupo não-escolhido. Governança
// determinística no controlador (decideShowGate), não mais uma regra-no-prompt
// (Lei 4 de arquitetura-agentes-ia.md). O default de produto (AskUserQuestion,
// 2026-07-01 — ver docs/correcoes/decisions/2026-07-01-bloco-b-intent-ver-mais.md):
// re-apresentar o comparativo → o modelo re-lista conversacionalmente quando o
// gate NÃO dispara.
// ============================================================================

function postRevealMeta(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentPersona: "rafael-auto",
		currentCategory: "auto",
		experiencePrev: "first",
		qualifyConsented: true,
		identityCollected: true,
		qualifyAnswers: {
			creditMax: 106_000,
			prazoMeses: 0,
			objetivo: "contemplacao_rapida",
			hasLance: "no",
			lanceEmbutido: false,
		},
		searchDispatched: true,
		revealCompleted: true,
		simulatorOfferDispatched: true,
		...over,
	};
}

describe("FIX-183 — 'ver mais' não empurra o funil (roteamento determinístico)", () => {
	it("num turno de primeiro contato, wants_more_options NÃO abre gate de coleta", () => {
		// Este é o assert que FALHA antes do fix: sem a cláusula explícita, o intent
		// desconhecido caía no ramo neutral-primeiro-contato (hasNoQualifyData=true)
		// e o gate DISPARAVA. "Ver mais" nunca deve abrir UI estruturada.
		expect(
			decideShowGate({ gate: "experience", intent: "wants_more_options", meta: {}, isUserTurn: true }),
		).toBe(false);
	});

	it("pós-reveal, wants_more_options NÃO dispara o card de decisão (o desvio da Mirella)", () => {
		expect(
			decideShowGate({
				gate: "decision",
				intent: "wants_more_options",
				meta: postRevealMeta(),
				isUserTurn: true,
			}),
		).toBe(false);
	});

	it("pós-reveal, wants_more_options NÃO dispara a oferta do simulador", () => {
		expect(
			decideShowGate({
				gate: "simulator-offer",
				intent: "wants_more_options",
				meta: postRevealMeta({ simulatorOfferDispatched: false }),
				isUserTurn: true,
			}),
		).toBe(false);
	});

	it("wants_more_options NÃO dispara nova busca (search)", () => {
		expect(
			decideShowGate({
				gate: "search",
				intent: "wants_more_options",
				meta: postRevealMeta(),
				isUserTurn: true,
			}),
		).toBe(false);
	});

	it("contraste — ready_to_proceed AINDA avança pra decisão (não regride o funil legítimo)", () => {
		expect(
			decideShowGate({
				gate: "decision",
				intent: "ready_to_proceed",
				meta: postRevealMeta(),
				isUserTurn: true,
			}),
		).toBe(true);
	});

	it("turno autoral do servidor (directive) segue mostrando o gate mesmo com o intent novo", () => {
		// !isUserTurn é avaliado ANTES da cláusula de intent — directives continuam
		// determinísticos (o servidor sabe o que dispara).
		expect(
			decideShowGate({
				gate: "decision",
				intent: "wants_more_options",
				meta: postRevealMeta(),
				isUserTurn: false,
			}),
		).toBe(true);
	});
});
