// Card de fecho exige cota na mesa — `revealCompleted` não basta.
//
// Sonda de 14/08, depois de a busca vazia passar a invalidar a oferta ancorada:
// a conversa emitiu `decision_prompt` e depois `contract_form` com
// `recommendedOffer` nulo e nenhuma cota escolhida, e o agente afirmou "as
// opções com parcela de R$ 200 estão na tela". A busca por parcela tinha
// voltado em branco; não havia opção nenhuma.
//
// O guard `premature-contract` já existia, mas olhava só `revealCompleted` — e
// essa flag, uma vez verdadeira, nunca mais volta atrás. Enquanto uma oferta
// velha sobrevivia no estado o furo não aparecia; agora que a âncora podre é
// invalidada (como deve ser), o buraco fica exposto.
//
// O invariante é de negócio e verificável: submeter o formulário cria proposta
// REAL na Bevi, com CPF e consulta de bureau. Fazer isso sem uma cota escolhida
// é abrir contrato sobre nada.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "../personas";
import { evaluateArtifactGuards } from "./artifact-guard";

function ctx(meta: Partial<ConversationMetadata>) {
	return {
		meta: meta as ConversationMetadata,
		userIntent: "ready_to_proceed" as const,
		isUserTurn: true,
		channel: "whatsapp" as const,
		discoveryCount: 0,
		conversationId: "conv-teste",
		turnArtifactTypes: [] as string[],
	};
}

const OFERTA = {
	groupId: "g1",
	administradora: "TRADIÇÃO",
	category: "moto" as const,
	creditValue: 22_077,
	monthlyPayment: 484,
	termMonths: 61,
};

describe("fecho exige cota na mesa", () => {
	it("suprime contract_form quando a busca esvaziou a tela", () => {
		const v = evaluateArtifactGuards({
			...ctx({ revealCompleted: true, recommendedOffer: undefined, discoveryEmptyStreak: 1 }),
			artifactType: "contract_form",
		});
		expect(v.allow).toBe(false);
	});

	it("suprime decision_prompt no mesmo estado — não há o que decidir", () => {
		const v = evaluateArtifactGuards({
			...ctx({ revealCompleted: true, recommendedOffer: undefined, discoveryEmptyStreak: 1 }),
			artifactType: "decision_prompt",
		});
		expect(v.allow).toBe(false);
	});

	it("com oferta ancorada, o contract_form passa", () => {
		const v = evaluateArtifactGuards({
			...ctx({ revealCompleted: true, recommendedOffer: OFERTA }),
			artifactType: "contract_form",
		});
		expect(v.allow).toBe(true);
	});

	it("com cota ESCOLHIDA, passa mesmo sem recommendedOffer", () => {
		// A escolha é mais forte que a recomendação: quem já disse qual cota quer
		// tem o que contratar, e barrá-lo seria segurar a venda de quem decidiu.
		const v = evaluateArtifactGuards({
			...ctx({
				revealCompleted: true,
				recommendedOffer: undefined,
				escolha: { groupId: "g1", origem: "afirmacao" as const },
			} as Partial<ConversationMetadata>),
			artifactType: "contract_form",
		});
		expect(v.allow).toBe(true);
	});

	it("com a cota do CONTRATO ancorada, também passa", () => {
		const v = evaluateArtifactGuards({
			...ctx({
				revealCompleted: true,
				recommendedOffer: undefined,
				contractOffer: OFERTA,
			} as Partial<ConversationMetadata>),
			artifactType: "contract_form",
		});
		expect(v.allow).toBe(true);
	});
});
