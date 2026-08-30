// Sonda de conversa real, 2026-08-12 — o log de rota do turno em que o cliente
// pediu pra fechar:
//
//   [route] gate=experience ... reveal=true
//   [route] gate=experience ... reveal=true
//   [route] gate=experience ... reveal=true
//
// Três turnos seguidos com a MESMA pergunta pendente. Na tela isso foi o
// cliente dizendo "Quero essa mesma, bora fechar" e ouvindo "você já fez
// consórcio antes?", e depois "isso, quero contratar" e ouvindo a pergunta de
// lance — a venda andando pra trás enquanto ele empurra pra frente.
//
// A causa é estrutural e simples: `experience` é o ÚNICO gate opcional sem
// guarda de idempotência. `recoConsentDispatched`, `simulatorOfferDispatched`,
// `decisionDispatched`, `scarcityDispatched` e `contractFormDispatched` todos
// existem; `experience` não tinha, então `nextGate` o devolvia enquanto
// `experiencePrev` estivesse vazio — e ele fica vazio para sempre quando o
// cliente simplesmente não responde e segue falando de outra coisa.
//
// A regra que faltava: gate de qualificação OPCIONAL pergunta uma vez. Se a
// resposta não vier, o funil segue — o dado ajuda a vender, não é pré-requisito
// de nada. Gate de COLETA (credit, identify, lance) continua insistindo, porque
// sem aquele dado a Bevi não simula nem contrata.

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";

const posReveal: ConversationMetadata = {
	desireAsked: true,
	identityCollected: true,
	searchDispatched: true,
	revealCompleted: true,
	qualifyAnswers: { creditMin: 80_000, creditMax: 100_000, prazoMeses: 48, hasLance: "no" },
};

describe("experience pergunta uma vez", () => {
	it("na primeira vez, pergunta", () => {
		expect(nextGate(posReveal, { hasContactName: true })).toBe("experience");
	});

	it("já perguntado e sem resposta, o funil SEGUE em vez de repetir", () => {
		const gate = nextGate({ ...posReveal, experienceDispatched: true }, { hasContactName: true });
		expect(gate).not.toBe("experience");
	});

	it("resposta recebida mantém o comportamento de sempre", () => {
		const gate = nextGate(
			{ ...posReveal, experienceDispatched: true, experiencePrev: "first" },
			{ hasContactName: true },
		);
		expect(gate).not.toBe("experience");
	});

	it("gate de COLETA continua insistindo mesmo depois de já ter sido mostrado", () => {
		// Sem identidade a Bevi não contrata — esse não é opcional e não cede.
		//
		// 2026-08-27: com a vitrine, o `identify` deixou de ser pedágio pré-busca e
		// desceu para o fecho. O que este teste protege não mudou (gate de coleta
		// obrigatória não cede como o `experience` cede); mudou ONDE ele acontece —
		// então o cenário precisa de uma cota já escolhida, que é o ponto em que o
		// CPF passa a ser exigido. Antes daí, `nextGate` devolve `decision`, porque
		// é isso que falta: o cliente ainda não disse qual quer.
		const gate = nextGate(
			{
				...posReveal,
				experienceDispatched: true,
				identityCollected: false,
				escolha: { groupId: "g-1", origem: "mencao" },
			} as typeof posReveal,
			{ hasContactName: true },
		);
		expect(gate).toBe("identify");
	});

	it("'doubts' já respondido continua abrindo a espera (não regride o FIX-233)", () => {
		const gate = nextGate(
			{ ...posReveal, experienceDispatched: true, experiencePrev: "doubts" },
			{ hasContactName: true },
		);
		expect(gate).toBe("doubts-wait");
	});
});
