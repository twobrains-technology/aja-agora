/**
 * C6 — a fricção de digitar CPF no celular.
 *
 * A planilha marca o item como resolvido (máscara + `inputMode="numeric"` +
 * placeholder), e ele está mesmo. O que este arquivo faz é **encerrar com
 * prova** em vez de com afirmação, e cobrir o caso que costuma quebrar máscara
 * escrita à mão: a pessoa COLA um CPF que já vem formatado — do gerenciador de
 * senhas, de um WhatsApp, de um print. Máscara posicional engasga aí; máscara
 * que reduz a dígitos antes de remontar, não.
 */

import { describe, expect, it } from "vitest";

import { mascararCelular, mascararCpf, somenteDigitos } from "./mascaras";

describe("mascararCpf", () => {
	it("formata enquanto a pessoa digita", () => {
		expect(mascararCpf("1")).toBe("1");
		expect(mascararCpf("123")).toBe("123");
		expect(mascararCpf("1234")).toBe("123.4");
		expect(mascararCpf("1234567")).toBe("123.456.7");
		expect(mascararCpf("1234567890")).toBe("123.456.789-0");
		expect(mascararCpf("12345678901")).toBe("123.456.789-01");
	});

	it("aceita CPF JÁ formatado sem estragá-lo (o caso da colagem)", () => {
		expect(mascararCpf("123.456.789-01")).toBe("123.456.789-01");
	});

	it("aceita colagem com sujeira em volta", () => {
		expect(mascararCpf("CPF: 123.456.789-01 ")).toBe("123.456.789-01");
		expect(mascararCpf("123 456 789 01")).toBe("123.456.789-01");
	});

	it("é idempotente — reaplicar a máscara não muda nada", () => {
		const uma = mascararCpf("12345678901");
		expect(mascararCpf(uma)).toBe(uma);
		expect(mascararCpf(mascararCpf(uma))).toBe(uma);
	});

	it("descarta o que passa de 11 dígitos em vez de embaralhar", () => {
		expect(mascararCpf("123456789012345")).toBe("123.456.789-01");
	});

	it("apagar não trava: o valor volta encolhendo", () => {
		// O que o React entrega no `onChange` depois de um backspace é o valor
		// exibido menos um caractere. Se a máscara devolvesse o mesmo valor de
		// antes, o campo ficaria preso — é assim que máscara feita à mão quebra.
		expect(mascararCpf("123.456.789-0")).toBe("123.456.789-0");
		expect(mascararCpf("123.456.789-")).toBe("123.456.789");
		expect(mascararCpf("123.456.78")).toBe("123.456.78");
		expect(mascararCpf("")).toBe("");
	});

	it("ignora letra digitada por engano", () => {
		expect(mascararCpf("12a3b45678901")).toBe("123.456.789-01");
	});
});

describe("mascararCelular", () => {
	it("formata enquanto a pessoa digita", () => {
		expect(mascararCelular("1")).toBe("1");
		expect(mascararCelular("11")).toBe("11");
		expect(mascararCelular("119")).toBe("(11) 9");
		// Até o 11º dígito não dá para saber se é fixo ou celular, então o hífen
		// entra no 4º e anda depois — é o comportamento de toda máscara de
		// telefone brasileira.
		expect(mascararCelular("1199999")).toBe("(11) 9999-9");
		expect(mascararCelular("11999999999")).toBe("(11) 99999-9999");
	});

	it("aceita celular JÁ formatado", () => {
		expect(mascararCelular("(11) 99999-9999")).toBe("(11) 99999-9999");
	});

	it("formata FIXO de 10 dígitos com o hífen no lugar certo", () => {
		// O defeito que este caso pegou (30/08/2026): a máscara antiga punha o
		// hífen sempre depois do 5º dígito e exibia `(11) 33334-444` — um número
		// brasileiro comum, mostrado errado no formulário que pede CPF.
		expect(mascararCelular("1133334444")).toBe("(11) 3333-4444");
		expect(mascararCelular("(11) 3333-4444")).toBe("(11) 3333-4444");
	});

	it("o hífen anda quando o 11º dígito chega — fixo vira celular", () => {
		expect(mascararCelular("119999999")).toBe("(11) 9999-999");
		expect(mascararCelular("1199999999")).toBe("(11) 9999-9999");
		expect(mascararCelular("11999999999")).toBe("(11) 99999-9999");
	});

	it("é idempotente", () => {
		const um = mascararCelular("11999999999");
		expect(mascararCelular(um)).toBe(um);
	});

	it("apagar não trava", () => {
		expect(mascararCelular("(11) 99999-999")).toBe("(11) 9999-9999");
		expect(mascararCelular("(11) 9999")).toBe("(11) 9999");
		expect(mascararCelular("(11) ")).toBe("11");
		expect(mascararCelular("")).toBe("");
	});
});

describe("somenteDigitos", () => {
	it("é o que os dois formulários mandam para o servidor", () => {
		expect(somenteDigitos("123.456.789-01")).toBe("12345678901");
		expect(somenteDigitos("(11) 99999-9999")).toBe("11999999999");
	});
});
