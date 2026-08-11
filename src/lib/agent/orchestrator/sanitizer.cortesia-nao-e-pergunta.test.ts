// Achado em PRODUÇÃO pelo Langfuse — trace `be5cc1e6dd32923553d18a61a0dc505c`
// (`turn:whatsapp`, environment `production`, 2026-08-10 21:35 BRT):
//
//   input   "oi"
//   output  "Oi, Kairo! Tudo certo?"
//   gate    desire        turno_mudo 0        judge_resolved 1
//   log     [gate-undelivered] conv=ed3082ce gate=desire — SEM entrega no
//           WhatsApp (nem interactive nem texto); turno pode fechar mudo
//
// O turno não fechou mudo (o modelo escreveu), mas a venda não andou: o cliente
// recebeu SÓ uma cortesia. E os três juízes aprovaram (`judge_resolved=1`),
// porque do ponto de vista deles a fala é educada e verdadeira.
//
// CAUSA, provada no código:
//   1. `isInterrogativeSentence` (sanitizer.ts:445) é `/\?\s*$/` — qualquer
//      coisa terminada em "?" é "pergunta".
//   2. "Tudo certo?" casa → `jaPerguntou = true` (sanitizer.ts:1162).
//   3. `hasHeldQuestion()` → `ev.modelAsked = true`.
//   4. `whatsapp/adapter.ts:593` faz `ev.modelAsked ? null : gateTextPrompt(…)`
//      e APAGA a pergunta canônica do gate.
//   5. Gate `desire` não tem interactive → não sobra nada para entregar.
//
// Por que só dói no WhatsApp: na web o gate vira card renderizado na tela; aqui
// os gates conversacionais (`WHATSAPP_TEXT_GATES`) só existem como texto — e é
// esse texto que some. `WHATSAPP_GATES_WITHOUT_FALLBACK` está vazio desde
// 2026-07-21, então nenhum gate tem rede.
//
// Isto NÃO é engessar a conversa: cortesia de abertura já é PROIBIDA pelo
// system-prompt ("Não gaste turno com 'tudo bem?'", system-prompt.ts:41). O que
// o fix garante é que, quando o modelo a escreve mesmo assim, ela não consuma a
// cota de pergunta do turno e derrube o gate junto. A cortesia continua sendo
// ENTREGUE ao cliente — ela só deixa de contar como "o modelo já perguntou".

import { describe, expect, it } from "vitest";
import { contemPerguntaQueOcupaCota, EphemeralTextFilter } from "./sanitizer";

/** Roda o texto inteiro pelo filtro como o runner faz (push + flush). */
function passarPeloFiltro(texto: string): { saida: string; perguntou: boolean } {
	const filtro = new EphemeralTextFilter();
	const saida = filtro.push(texto) + filtro.flush();
	return { saida, perguntou: filtro.hasHeldQuestion() };
}

describe("cortesia interrogativa não consome a cota de pergunta do turno", () => {
	// A fala EXATA que produziu o `[gate-undelivered]` em produção.
	it("'Oi, Kairo! Tudo certo?' não marca que o modelo perguntou", () => {
		const { perguntou } = passarPeloFiltro("Oi, Kairo! Tudo certo?");
		expect(
			perguntou,
			"a cortesia marcou `jaPerguntou` — é isso que apaga a pergunta do gate " +
				"no WhatsApp (adapter.ts:593) e deixa o cliente sem nada pra responder",
		).toBe(false);
	});

	it.each([
		"Tudo bem?",
		"Oi! Tudo bem com você?",
		"E aí, beleza?",
		"Olá, como vai?",
		"Bom dia! Tudo certo?",
		"Como você está?",
	])("cortesia '%s' não conta como pergunta", (fala) => {
		expect(passarPeloFiltro(fala).perguntou).toBe(false);
	});

	// A cortesia é INOFENSIVA, não proibida — o cliente continua recebendo.
	it("a cortesia continua sendo entregue ao cliente", () => {
		const { saida } = passarPeloFiltro("Oi, Kairo! Tudo certo?");
		expect(saida).toContain("Tudo certo?");
	});

	// Contraprova: pergunta de verdade continua valendo como pergunta, senão o
	// fix viraria uma porta aberta pra duplicar balão (o motivo da reversão de
	// 2026-07-21).
	it.each([
		"Me conta: você quer um carro, uma moto ou um imóvel?",
		"Qual é o seu CPF?",
		"Você já fez consórcio antes?",
		"Quanto custa esse Corolla hoje?",
		"Posso te mostrar a opção que eu recomendo?",
	])("pergunta real '%s' continua contando", (fala) => {
		expect(passarPeloFiltro(fala).perguntou).toBe(true);
	});

	// O caso misto é o que o system-prompt de fato pede ("cumprimente e emende a
	// primeira pergunta útil na MESMA mensagem"): a cortesia passa batida e a
	// pergunta útil é a que ocupa a cota.
	it("cortesia + pergunta útil no mesmo turno: quem conta é a pergunta útil", () => {
		const { saida, perguntou } = passarPeloFiltro(
			"Oi, Kairo! Tudo certo? Me conta o que você quer conquistar: um carro, uma moto ou um imóvel?",
		);
		expect(perguntou).toBe(true);
		expect(saida).toContain("carro");
		// A cortesia não pode ter sido dropada como "pergunta extra".
		expect(saida).toContain("Tudo certo?");
	});
});

// O segundo caminho do mesmo sinal. `converse.ts` derivava `modelAsked` também
// de `events.some(ev => ev.text.includes("?"))` — QUALQUER "?" em QUALQUER
// posição. Corrigir só o filtro deixaria o bug vivo por esta porta: a fala de
// produção tem "?" e marcaria `modelAsked` de novo, apagando o gate igual.
describe("contemPerguntaQueOcupaCota — o caminho do converse.ts", () => {
	it("a fala exata de produção não conta como pergunta", () => {
		expect(contemPerguntaQueOcupaCota("Oi, Kairo! Tudo certo?")).toBe(false);
	});

	it("texto sem '?' nenhum não conta", () => {
		expect(contemPerguntaQueOcupaCota("Boa, Kairo. Vou buscar as opções.")).toBe(false);
	});

	it("pergunta de venda conta, mesmo vindo depois da cortesia", () => {
		expect(
			contemPerguntaQueOcupaCota("Oi, Kairo! Tudo certo? Você quer um carro ou uma moto?"),
		).toBe(true);
	});

	it("pergunta de venda sozinha conta", () => {
		expect(contemPerguntaQueOcupaCota("Qual é o seu CPF?")).toBe(true);
	});
});
