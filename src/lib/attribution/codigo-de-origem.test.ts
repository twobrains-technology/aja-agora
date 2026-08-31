/**
 * A3 — o código que amarra a conversa de WhatsApp à visita que a originou.
 *
 * O que estes casos protegem é a ponta frágil: entre o `?text=` que a gente
 * escreve e o webhook que a gente lê existe o teclado de uma pessoa real, que
 * apaga, acrescenta, cola e às vezes manda a frase pela metade. O código tem
 * que sobreviver a isso — e, quando não sobreviver, tem que falhar devolvendo
 * `null`, nunca uma atribuição errada.
 */

import { describe, expect, it } from "vitest";

import {
	carimbarOrigem,
	codigoDaVisita,
	extrairCodigoDeOrigem,
	removerCarimbo,
} from "./codigo-de-origem";

const VISITA = "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

describe("codigoDaVisita", () => {
	it("é o prefixo do próprio UUID da visita", () => {
		expect(codigoDaVisita(VISITA)).toBe("a1b2c3d4");
	});

	it("normaliza para minúsculo — o UUID pode vir em qualquer caixa", () => {
		expect(codigoDaVisita(VISITA.toUpperCase())).toBe("a1b2c3d4");
	});

	it("devolve null para o que não é UUID, em vez de lançar", () => {
		// O chamador é o botão flutuante: cookie estranho custa a ATRIBUIÇÃO
		// daquele toque, jamais o toque.
		expect(codigoDaVisita("")).toBeNull();
		expect(codigoDaVisita(null)).toBeNull();
		expect(codigoDaVisita(undefined)).toBeNull();
		expect(codigoDaVisita("nao-e-uuid")).toBeNull();
		expect(codigoDaVisita("a1b2c3d4")).toBeNull();
	});
});

describe("carimbarOrigem", () => {
	it("põe o código no fim da fala, entre parênteses", () => {
		expect(carimbarOrigem("Oi! Quero comparar consórcios.", "a1b2c3d4")).toBe(
			"Oi! Quero comparar consórcios. (ref a1b2c3d4)",
		);
	});

	it("sem código, a fala sai intacta — nada de '(ref )' pendurado", () => {
		expect(carimbarOrigem("Oi! Quero comparar consórcios.", null)).toBe(
			"Oi! Quero comparar consórcios.",
		);
		expect(carimbarOrigem("Oi! Quero comparar consórcios.", "")).toBe(
			"Oi! Quero comparar consórcios.",
		);
	});

	it("fala VAZIA não vira só o código", () => {
		// O card de handoff do fecho tem `mensagemInicial` opcional. Sem esta
		// guarda, o botão "Falar no WhatsApp" abria a conversa com " (ref
		// a1b2c3d4)" na caixa de envio — um texto que o cliente não escreveu e não
		// entende, no momento de maior intenção do funil. Trocar "sem texto" por
		// "texto errado" é pior do que não carimbar.
		expect(carimbarOrigem("", "a1b2c3d4")).toBe("");
		expect(carimbarOrigem("   ", "a1b2c3d4")).toBe("");
	});

	it("recusa código com formato errado em vez de carimbar lixo", () => {
		expect(carimbarOrigem("Oi!", "não-é-código")).toBe("Oi!");
		expect(carimbarOrigem("Oi!", "a1b2c3")).toBe("Oi!");
		expect(carimbarOrigem("Oi!", "a1b2c3d4e5")).toBe("Oi!");
	});

	it("o ida-e-volta fecha", () => {
		const fala = "Oi! Quero comparar consórcios.";
		const carimbada = carimbarOrigem(fala, codigoDaVisita(VISITA));
		expect(extrairCodigoDeOrigem(carimbada)).toBe("a1b2c3d4");
		expect(removerCarimbo(carimbada)).toBe(fala);
	});
});

describe("extrairCodigoDeOrigem", () => {
	it("acha o código na fala que saiu do nosso link", () => {
		expect(extrairCodigoDeOrigem("Oi! Quero comparar consórcios. (ref a1b2c3d4)")).toBe("a1b2c3d4");
	});

	it("sobrevive ao que a pessoa digitou por cima", () => {
		expect(
			extrairCodigoDeOrigem("Boa tarde! Oi! Quero comparar consórcios. (ref a1b2c3d4) urgente"),
		).toBe("a1b2c3d4");
		expect(extrairCodigoDeOrigem("(ref a1b2c3d4)\nquero um carro")).toBe("a1b2c3d4");
		expect(extrairCodigoDeOrigem("quero um carro ( ref  a1b2c3d4 )")).toBe("a1b2c3d4");
		expect(extrairCodigoDeOrigem("Oi (REF A1B2C3D4)")).toBe("a1b2c3d4");
	});

	it("não confunde parêntese qualquer com carimbo", () => {
		expect(extrairCodigoDeOrigem("Oi! Quero comparar consórcios.")).toBeNull();
		expect(extrairCodigoDeOrigem("me liga (ref agora)")).toBeNull();
		expect(extrairCodigoDeOrigem("(ref 12345)")).toBeNull();
		expect(extrairCodigoDeOrigem("(ref zzzzzzzz)")).toBeNull();
		expect(extrairCodigoDeOrigem("")).toBeNull();
		expect(extrairCodigoDeOrigem(null)).toBeNull();
	});

	it("com dois carimbos, o ÚLTIMO vence", () => {
		// Colou uma conversa antiga por cima da nova: o que descreve como ela
		// chegou AGORA é o de baixo.
		expect(extrairCodigoDeOrigem("(ref aaaaaaaa) blá blá (ref bbbbbbbb)")).toBe("bbbbbbbb");
	});
});

describe("removerCarimbo", () => {
	it("tira o código antes de a fala virar histórico do agente", () => {
		// O inbound é persistido como fala do CLIENTE e relido pelo modelo nos
		// turnos seguintes. Com o código dentro, o agente aprenderia a tratá-lo
		// como parte do pedido.
		expect(removerCarimbo("Oi! Quero comparar consórcios. (ref a1b2c3d4)")).toBe(
			"Oi! Quero comparar consórcios.",
		);
	});

	it("não deixa espaço duplo onde o código estava", () => {
		expect(removerCarimbo("Quero (ref a1b2c3d4) um carro")).toBe("Quero um carro");
	});

	it("fala sem carimbo passa sem alteração", () => {
		expect(removerCarimbo("Oi! Quero comparar consórcios.")).toBe("Oi! Quero comparar consórcios.");
	});

	it("mensagem que era SÓ o carimbo não vira string suja", () => {
		expect(removerCarimbo("(ref a1b2c3d4)")).toBe("");
	});
});
