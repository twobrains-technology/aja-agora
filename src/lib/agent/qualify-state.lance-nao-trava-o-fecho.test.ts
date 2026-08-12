// Sonda de conversa real, 2026-08-12 — a última porta do defeito do Caua.
//
//   👤 Quero essa mesma, bora fechar
//   🤖 Show! Cota do Itaú confirmada... Antes de seguir pro contrato, você já
//      teve consórcio antes?
//   👤 isso, quero contratar
//   🤖 Bora! Só falta um detalhe importante antes de seguir: você teria como
//      dar algum lance próprio?
//
// O cliente pediu pra contratar DUAS vezes e recebeu duas perguntas. Nenhum
// `contract_form`. Com a cota já ancorada (`escolha`, gravada pela tool
// `escolher_cota`), a cascata de lance continuava bloqueando o caminho até o
// formulário.
//
// Lance NÃO é pré-requisito de contratação — o código já diz isso em outras
// palavras: "lance embutido e simulador existem por UM motivo: ANTECIPAR a
// contemplação". É argumento de venda, e bom; mas quem já escolheu a cota e
// pede o contrato não pode ser barrado por ele. Um vendedor humano fecha e
// oferece o lance junto, não segura o contrato como refém da resposta.
//
// O que este teste NÃO afrouxa: sem fechamento sinalizado, a jornada de lance
// segue inteira e na mesma ordem. E os gates de COLETA de verdade (identify,
// credit) continuam bloqueando em qualquer cenário — sem CPF e sem faixa a Bevi
// não contrata.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";

const cotaEscolhida: ConversationMetadata = {
	desireAsked: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	experienceDispatched: true,
	escolha: { origem: "mencao" },
	qualifyAnswers: { creditMin: 80_000, creditMax: 100_000 },
};

describe("lance não trava o fechamento de quem já escolheu", () => {
	it("com a cota ancorada, o funil vai pro contrato e não pra pergunta de lance", () => {
		expect(nextGate(cotaEscolhida, { hasContactName: true })).toBe("contract");
	});

	it("nem lance-value, nem embutido, nem simulador barram o caminho", () => {
		const gate = nextGate(
			{ ...cotaEscolhida, qualifyAnswers: { ...cotaEscolhida.qualifyAnswers, hasLance: "yes" } },
			{ hasContactName: true },
		);
		expect(gate).not.toBe("lance-value");
		expect(gate).not.toBe("lance-embutido");
		expect(gate).not.toBe("simulator-offer");
		expect(gate).toBe("contract");
	});

	it("SEM fechamento sinalizado, a jornada de lance segue inteira", () => {
		const gate = nextGate(
			{
				...cotaEscolhida,
				escolha: undefined,
				// `timeframe` vem antes do lance na cascata; com o prazo já respondido
				// o teste mira o gate que ele quer de fato observar.
				qualifyAnswers: { ...cotaEscolhida.qualifyAnswers, prazoMeses: 48 },
			},
			{ hasContactName: true },
		);
		expect(gate).toBe("lance");
	});

	it("sem identidade, nem quem está fechando passa — a Bevi não contrata sem CPF", () => {
		const gate = nextGate({ ...cotaEscolhida, identityCollected: false }, { hasContactName: true });
		expect(gate).toBe("identify");
	});

	it("contrato já fechado continua terminal", () => {
		const gate = nextGate(
			{ ...cotaEscolhida, contractFormDispatched: true, contractClosed: true },
			{ hasContactName: true },
		);
		expect(gate).not.toBe("contract");
	});
});
