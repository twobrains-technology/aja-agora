// Produção, 2026-08-12 — o `recommendation_card` NUNCA saía. Log das duas
// conversas de validação, repetido:
//
//   [hero-awaits-reco-consent] guard: suprimindo recommendation_card no reveal
//   original — pendente até o gate reco-consent resolver
//
// E o efeito na tela: o cliente via só a `comparison_table`, o agente não tinha
// a recomendação ancorada, e quando o cliente dizia "quero essa mesma" a
// resposta era "não consigo ver qual cota você está vendo na tela".
//
// A cadeia (e o meu erro no meio dela):
//
//   · o portão do hero deixou de ser o CONVITE (`recoConsentAnswered`) e passou
//     a ser a EXPERIÊNCIA (`experiencePrev`) em 2026-07-21, junto com a decisão
//     de tirar o convite da cascata. Correto, e documentado no guard;
//   · no mesmo dia 2026-08-12 eu dei ao gate `experience` uma guarda de
//     idempotência (`experienceDispatched`): pergunta uma vez e, sem resposta, o
//     funil SEGUE — porque é qualificação opcional e estava travando a venda;
//   · as duas coisas juntas prendem o hero para sempre. Antes, o gate insistia
//     turno após turno até o cliente responder, e `experiencePrev` acabava
//     preenchido. Com o funil seguindo, ele fica `undefined` — e o guard espera
//     por uma resposta que ninguém mais vai pedir.
//
// A regra que faltava é a mesma dos dois lados: quem não bloqueia o funil também
// não pode bloquear o card. O portão é o cliente ter tido a CHANCE de dizer se
// já conhece consórcio — não a resposta ter chegado.

import { describe, expect, it } from "vitest";
import { evaluateArtifactGuards } from "@/lib/agent/orchestrator/artifact-guard";
import type { ConversationMetadata } from "@/lib/agent/personas";

const posReveal: ConversationMetadata = {
	desireAsked: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	qualifyAnswers: { creditMin: 80_000, creditMax: 100_000 },
};

function heroSuprimido(meta: ConversationMetadata): boolean {
	const veredito = evaluateArtifactGuards({
		artifactType: "recommendation_card",
		meta,
		conversationId: "teste",
	} as never);
	return veredito.allow === false;
}

describe("hero não fica refém de resposta que o funil não exige mais", () => {
	it("experiência ainda NÃO perguntada — o hero espera (comportamento original)", () => {
		expect(heroSuprimido(posReveal)).toBe(true);
	});

	it("experiência RESPONDIDA — o hero sai (comportamento original)", () => {
		expect(heroSuprimido({ ...posReveal, experiencePrev: "returning" })).toBe(false);
	});

	it("experiência PERGUNTADA e sem resposta — o hero sai mesmo assim", () => {
		// O funil já seguiu em frente; segurar o card aqui é prendê-lo para sempre.
		expect(heroSuprimido({ ...posReveal, experienceDispatched: true })).toBe(false);
	});

	it("cliente que já escolheu a cota vê a recomendação de qualquer forma", () => {
		expect(heroSuprimido({ ...posReveal, escolha: { origem: "mencao" } })).toBe(false);
	});

	it("o caminho antigo do convite continua liberando", () => {
		expect(heroSuprimido({ ...posReveal, recoConsentAnswered: true })).toBe(false);
	});
});
