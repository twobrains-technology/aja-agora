// Produção, 2026-08 — nomes de lead colhidos do banco: "Voltei" (5 conversas),
// "Quitar" (1), "Teste" (1).
//
// O "Quitar" entrega a mecânica inteira. A conversa real:
//
//   user:      "Tenho um financiamento de um apartamento e gostaria de trocar
//               para consórcio, como procede"
//   assistant: "Ótima ideia! ..."  + [card: quick_reply]
//   user:      "Quitar o financiamento atual"      ← clique num botão
//   → contact_name = "Quitar"
//
// `extractName` pegava a PRIMEIRA palavra de qualquer texto que chegasse com o
// gate `name` ativo. Um rótulo de botão, uma frase inteira, um desabafo — tudo
// virava nome, e daí em diante o agente cumprimentava "Oi, Quitar!" e a mesa
// recebia o lead assim.
//
// Duas defesas, porque a lista sozinha não segura: nome é resposta CURTA (uma
// frase de quatro palavras não é uma apresentação) e a palavra precisa passar
// pela lista compartilhada de "isto não é nome" (`ehNomeProprioPlausivel`, a
// mesma que o `save_contact_name` usa).

import { describe, expect, it } from "vitest";
import { captureAnswerNode } from "@/lib/agent/langgraph/nodes/capture";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

/** Estado mínimo do turno em que o cliente responde o gate do nome. */
function noGateDoNome(userText: string): AgentGraphStateType {
	return {
		isUserTurn: true,
		userText,
		gate: "name",
		contactName: null,
	} as unknown as AgentGraphStateType;
}

describe("captureAnswerNode — o que NÃO é nome", () => {
	it("rótulo de botão não vira nome (o caso 'Quitar', literal de produção)", () => {
		expect(captureAnswerNode(noGateDoNome("Quitar o financiamento atual"))).toEqual({});
	});

	it("frase não vira nome — apresentação é resposta curta", () => {
		for (const t of [
			"Tenho um financiamento de apartamento pra trocar",
			"Ainda não sei bem qual modelo",
			"Quero saber como funciona o consórcio",
			"Comprar um carro para trabalhar",
		]) {
			expect(captureAnswerNode(noGateDoNome(t)), t).toEqual({});
		}
	});

	it("palavra que não é nome de gente continua barrada", () => {
		for (const t of ["Voltei", "Teste", "Ainda", "Beleza"]) {
			expect(captureAnswerNode(noGateDoNome(t)), t).toEqual({});
		}
	});

	it("apresentação de verdade continua sendo capturada", () => {
		expect(captureAnswerNode(noGateDoNome("Romulo"))).toEqual({ contactName: "Romulo" });
		expect(captureAnswerNode(noGateDoNome("Pode me chamar de Kairo"))).toEqual({
			contactName: "Kairo",
		});
		expect(captureAnswerNode(noGateDoNome("sou o Erik"))).toEqual({ contactName: "Erik" });
		expect(captureAnswerNode(noGateDoNome("meu nome é Monique"))).toEqual({
			contactName: "Monique",
		});
	});

	it("nome composto curto passa", () => {
		expect(captureAnswerNode(noGateDoNome("Ana Clara"))).toEqual({ contactName: "Ana" });
	});
});
