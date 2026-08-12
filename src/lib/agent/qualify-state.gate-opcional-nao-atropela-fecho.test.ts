// Produção, 2026-08-10/11 — três clientes reais (Caua, Erik, Monique) receberam
// "você já fez consórcio antes?" DEPOIS de já terem escolhido a cota. No Caua o
// preço foi a venda inteira: o `experience` disparou por cima do fechamento e o
// `contract_form` nunca chegou à tela.
//
// Causa: na cascata pós-reveal, `timeframe` ganhou o guard `!meta.escolha`
// (quem já escolheu não precisa responder o prazo desejado — ele alimenta o
// SIMULADOR, não a contratação), mas `experience` ficou sem guard nenhum. Como
// `experiencePrev` só é preenchido quando o cliente responde o gate, qualquer
// conversa que chegue ao reveal sem essa resposta — retomada, WhatsApp, meta
// reidratado — volta pro começo do funil no exato turno em que a venda estava
// madura.
//
// A regra que os dois gates passam a compartilhar: `experience` e `timeframe`
// são qualificação OPCIONAL (contexto que ajuda a vender), não pré-requisito de
// contratação. Assim que o cliente sinaliza fechamento — cota ancorada,
// decisão aceita ou formulário já na tela — eles saem do caminho. Os gates de
// COLETA (credit, identify, lance) continuam bloqueando: sem aqueles dados a
// Bevi não simula nem contrata.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";

/** Estado real do Caua: reveal na tela, cota escolhida, prazo respondido — e
 * `experiencePrev` nunca capturado porque ele foi direto ao ponto. */
const fechandoSemExperiencia: ConversationMetadata = {
	desireAsked: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	escolha: { origem: "mencao" },
	qualifyAnswers: {
		creditMin: 80_000,
		creditMax: 100_000,
		prazoMeses: 60,
		hasLance: "no",
	},
};

describe("gate opcional não atropela cliente que está fechando", () => {
	it("cota escolhida e experiencePrev ausente — o funil segue pro contrato, não volta pra experience", () => {
		const gate = nextGate(fechandoSemExperiencia, { hasContactName: true });
		expect(gate).not.toBe("experience");
		expect(gate).toBe("contract");
	});

	it("decisão aceita (sem escolha ancorada) também tira experience do caminho", () => {
		const gate = nextGate(
			{
				...fechandoSemExperiencia,
				escolha: undefined,
				decisionDispatched: true,
				decisionAccepted: true,
			},
			{ hasContactName: true },
		);
		expect(gate).not.toBe("experience");
		expect(gate).toBe("contract");
	});

	it("formulário de contratação já na tela — nem experience nem timeframe reabrem", () => {
		const gate = nextGate(
			{
				...fechandoSemExperiencia,
				escolha: undefined,
				decisionDispatched: true,
				decisionAccepted: true,
				contractFormDispatched: true,
				qualifyAnswers: { creditMin: 80_000, creditMax: 100_000, hasLance: "no" },
			},
			{ hasContactName: true },
		);
		expect(gate).not.toBe("experience");
		expect(gate).not.toBe("timeframe");
	});

	it("mesmo estado SEM sinal de fechamento continua pedindo a experiência (o guard é exclusivo de quem está fechando)", () => {
		const gate = nextGate(
			{ ...fechandoSemExperiencia, escolha: undefined },
			{ hasContactName: true },
		);
		expect(gate).toBe("experience");
	});

	it("gate de COLETA continua bloqueando mesmo com a cota escolhida — sem identidade a Bevi não contrata", () => {
		const gate = nextGate(
			{ ...fechandoSemExperiencia, identityCollected: false },
			{ hasContactName: true },
		);
		expect(gate).toBe("identify");
	});
});
