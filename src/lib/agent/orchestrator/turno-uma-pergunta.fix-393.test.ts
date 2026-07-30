// FIX-393 — um turno, UMA pergunta: a do card que está entrando na tela.
//
// Rodada 2026-07-29 (grupo AJA AGORA + Twobrains, 28/07 16:01 — print
// `2807-1601-bernardo-01-ordem-pediu-dados-antes.jpg`). O Bernardo abriu a
// rodada de crítica com "Pessoal, essa ordem tá cagada. Pediu os dados antes de
// eu responder". No print, num só turno:
//
//   fala do agente → "Perfeito, um apartamento de R$ 700 mil é um investimento
//                     bacana! Você já tem alguma ideia de quanto conseguiria dar
//                     de entrada, ou quer simular sem entrada mesmo?"
//   card no mesmo turno → "Pra buscar suas ofertas reais" [CPF] [Celular] [LGPD]
//                          [Buscar minhas ofertas]
//
// Duas perguntas ao mesmo tempo, sobre coisas diferentes. Ele não teve como
// responder a da fala: o formulário atropelou.
//
// E "entrada" é conversa de LANCE, que por desenho não acontece aí — o lance
// saiu do meio do funil (FIX-215) e vive PÓS-reveal. O gate ativo era
// `identify`, e o card estava certo; a fala é que abriu um assunto de outra
// etapa.
//
// Dois furos de contexto, os dois no servidor (o que o modelo recebe é nosso):
//
//   1. `GATE_INTENT.identify` dizia o que pedir (CPF + celular) e nada sobre não
//      abrir OUTRO assunto no mesmo turno.
//   2. `buildGateContextText` (converse.ts), no caso com card, avisava que "o
//      sistema mostra o campo/os botões logo depois" — mas não amarrava a
//      pergunta da fala ÀQUELE card, então uma segunda pergunta seguia livre.
//
// ⚠️ Isto NÃO engessa a fala: o agente continua escolhendo as palavras, o tom e
// como reage ao que a pessoa contou. O que se fixa é QUANTAS perguntas abertas
// cabem num turno com formulário na tela — que é invariante de UX, não estilo.
import { describe, expect, it } from "vitest";
import { buildGateContextText, GATE_INTENT } from "./system-context";

describe("FIX-393 — turno com card não abre uma segunda pergunta", () => {
	it("identify proíbe explicitamente abrir a conversa de entrada/lance", () => {
		const t = GATE_INTENT.identify.toLowerCase();
		expect(t).toMatch(/entrada|lance/);
		// Tem que estar como PROIBIÇÃO, não como assunto sugerido.
		expect(t).toMatch(/não pergunte|nao pergunte|não abra|nao abra|nunca pergunte/);
	});

	it("identify continua explicando o que pede e por quê (o fix não esvazia o gate)", () => {
		const t = GATE_INTENT.identify.toLowerCase();
		expect(t).toMatch(/cpf/);
		expect(t).toMatch(/celular/);
		expect(t).toMatch(/lgpd|protegid/);
	});

	it("com card na tela, o contexto amarra a fala ÀQUELE card e proíbe segunda pergunta", () => {
		const texto = (buildGateContextText("identify", true) ?? "").toLowerCase();
		expect(texto).not.toBe("");
		expect(texto).toMatch(/uma pergunta/);
		// O ponto do bug: nada dizia que a pergunta da fala tem que ser a DO CARD.
		expect(texto).toMatch(/segunda pergunta|outra pergunta|nenhuma outra pergunta/);
	});

	it("sem card, o contexto segue dizendo que quem conduz é a fala", () => {
		const texto = (buildGateContextText("identify", false) ?? "").toLowerCase();
		expect(texto).toMatch(/não vai aparecer|nao vai aparecer/);
		expect(texto).toMatch(/sua fala/);
	});

	it("gate inexistente ou ausente devolve null (comportamento pré-existente)", () => {
		expect(buildGateContextText(undefined, true)).toBeNull();
		expect(buildGateContextText("gate-que-nao-existe", true)).toBeNull();
	});

	it("todo gate com intenção definida produz contexto — nenhum fica mudo", () => {
		const mudos = Object.keys(GATE_INTENT).filter(
			(gate) => !buildGateContextText(gate, true)?.trim(),
		);
		expect(mudos).toEqual([]);
	});
});
