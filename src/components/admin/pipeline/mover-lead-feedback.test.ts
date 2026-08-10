// O kanban tratava QUALQUER falha de mover card como a mesma coisa: um
// `window.alert("Erro ao mover lead. Tente novamente.")` (kanban-board.tsx:91).
//
// Duas consequências, ambas vistas na tela:
//
//  1. O 409 de regressão NÃO é erro — é regra (`forward_only`,
//     `leads/[id]/stage/route.ts:47`: o funil não anda pra trás sem flag). Dizer
//     "tente novamente" manda o operador repetir um gesto que vai falhar de novo,
//     toda vez, sem nunca explicar o porquê.
//  2. `window.alert` é modal: trava a aba até alguém clicar. Em automação de
//     browser ele congela a sessão inteira.
//
// A mensagem é decisão pura (status + payload → texto) — mora aqui, fora do
// componente, pra ser provada sem drag-and-drop nem DOM.

import { describe, expect, it } from "vitest";
import { mensagemDeFalhaAoMover } from "./mover-lead-feedback";

describe("mensagem de falha ao mover card no kanban", () => {
	it("regressão bloqueada explica a REGRA e não manda tentar de novo", () => {
		const msg = mensagemDeFalhaAoMover(409, {
			error: "Regression blocked",
			reason: "forward_only",
			current: "proposta_enviada",
		});

		expect(msg).toMatch(/tr[áa]s|voltar|retroced/i);
		// O que não pode: mandar repetir o gesto que a regra proíbe.
		expect(msg).not.toMatch(/tente novamente/i);
		// E precisa dizer ONDE o card ficou, senão o operador acha que sumiu.
		expect(msg).toContain("Proposta Enviada");
	});

	it("sessão expirada manda reentrar, não 'tente novamente'", () => {
		expect(mensagemDeFalhaAoMover(401, null)).toMatch(/sess[ãa]o|entrar|login/i);
	});

	it("sem permissão diz que é permissão — o operador não fica achando que é bug", () => {
		expect(mensagemDeFalhaAoMover(403, null)).toMatch(/permiss[ãa]o|autoriza/i);
	});

	it("lead que sumiu do banco não vira 'erro genérico'", () => {
		expect(mensagemDeFalhaAoMover(404, null)).toMatch(/n[ãa]o (foi )?encontrad/i);
	});

	it("falha de rede (sem status) é o único caso em que 'tente novamente' cabe", () => {
		const msg = mensagemDeFalhaAoMover(null, null);
		expect(msg).toMatch(/conex[ãa]o|rede/i);
		expect(msg).toMatch(/tente novamente/i);
	});

	it("erro inesperado do servidor não mente dizendo que é conexão", () => {
		const msg = mensagemDeFalhaAoMover(500, null);
		expect(msg).not.toMatch(/conex[ãa]o/i);
		expect(msg.trim().length).toBeGreaterThan(0);
	});
});
