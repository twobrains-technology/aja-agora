// Não se decide nem se contrata o que não existe na tela.
//
// Achado na sonda de 14/08, depois de a busca vazia passar a invalidar a oferta
// ancorada: a conversa chegou ao `contract_form` com `recommendedOffer` nulo e
// nenhuma cota escolhida, e o agente afirmou "as opções com parcela de R$ 200
// estão na tela" — não estavam. A busca por parcela tinha voltado vazia.
//
// O buraco é do funil, não da fala: o bloco pós-reveal só olhava
// `revealCompleted`, e essa flag continua verdadeira depois de uma busca
// posterior voltar em branco. Antes da invalidação da âncora o defeito não
// aparecia porque SEMPRE havia uma oferta velha no estado para segurar a
// narrativa — a mesma âncora podre que fazia o agente prometer o que não tinha.
//
// A regra é a de qualquer vendedor: sem cota na mesa não se pede documento.
import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "./personas";
import { nextGate } from "./qualify-state";

/** Conversa que já revelou ofertas e cujo reveal foi depois esvaziado por uma
 *  busca em branco (o alvo mudou para uma parcela sem oferta possível). */
function reveladaMasSemOferta(): ConversationMetadata {
	return {
		desireAsked: true,
		desireAnswered: true,
		identityCollected: true,
		currentCategory: "moto",
		revealCompleted: true,
		searchDispatched: false,
		discoveryEmptyStreak: 1,
		recommendedOffer: undefined,
		qualifyAnswers: {
			creditMax: 20_000,
			creditMin: 18_000,
			parcelaAlvo: 200,
			alvoDeBusca: "parcela",
			hasLance: "no",
			prazoMeses: 60,
		},
	} as ConversationMetadata;
}

describe("nextGate — sem oferta ancorada não há decisão nem contrato", () => {
	it("não manda para `decision` quando não há oferta nem escolha", () => {
		expect(nextGate(reveladaMasSemOferta(), { hasContactName: true })).not.toBe("decision");
	});

	it("não manda para `contract` quando não há oferta nem escolha", () => {
		const meta = { ...reveladaMasSemOferta(), decisionAccepted: true } as ConversationMetadata;
		expect(nextGate(meta, { hasContactName: true })).not.toBe("contract");
	});

	it("sem oferta, o funil volta a BUSCAR em vez de seguir para o fecho", () => {
		// É o comportamento correto e já existente: `searchDispatched` continua
		// falso depois de uma busca vazia, e a cascata devolve o funil para a
		// busca. O `contract_form` que apareceu na sonda não veio daqui — veio de
		// tool chamada pelo modelo, e é lá que o guard precisa estar.
		expect(nextGate(reveladaMasSemOferta(), { hasContactName: true })).toBe("search");
	});

	it("com oferta ancorada, o funil pós-reveal segue como sempre", () => {
		const meta = {
			...reveladaMasSemOferta(),
			searchDispatched: true,
			discoveryEmptyStreak: 0,
			recommendedOffer: {
				groupId: "g1",
				administradora: "TRADIÇÃO",
				category: "moto",
				creditValue: 22_077,
				monthlyPayment: 484,
				termMonths: 61,
			},
		} as ConversationMetadata;
		// Com oferta na tela o funil retoma a cascata pós-reveal (aqui, a pergunta
		// de experiência que precede o resto) — nunca volta para a busca.
		expect(nextGate(meta, { hasContactName: true })).not.toBe("search");
	});

	it("uma cota JÁ escolhida não é atropelada pela busca vazia", () => {
		// Quem escolheu a cota tem o que contratar. O funil ainda devolve `search`
		// (a última busca não deu resultado), mas o que NÃO pode acontecer é a
		// escolha dele desaparecer — é ela que o guard de artefato consulta.
		const meta = {
			...reveladaMasSemOferta(),
			decisionAccepted: true,
			escolha: { groupId: "g1", origem: "afirmacao" },
		} as unknown as ConversationMetadata;
		expect(nextGate(meta, { hasContactName: true })).not.toBe("decision");
	});
});
