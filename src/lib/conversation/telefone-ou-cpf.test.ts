// A regra telefone × CPF é UMA só, em `src/lib/conversation/telefone-ou-cpf.ts`,
// importada pelo capturador do WhatsApp e pelo do Pi. O que se prova aqui é a
// decisão; a passagem completa entre os dois canais está em
// `src/lib/agent/pi/turno-c.test.ts`.
import { describe, expect, it } from "vitest";
import {
	celularEhTelefone,
	dddValido,
	decidirCpfDoTexto,
	ehCelularBR,
	extractCpf,
	pedidoDeCpfNoUltimoBalao,
} from "./telefone-ou-cpf";

// Celular de São Paulo (DDD 11 + 9º dígito) que também passa no DV do CPF.
const AMBIGUO = "11900000083";
// CPF com DV válido que não tem cara de celular (começa em 02, que não é DDD).
const CPF = "52998224725";

describe("telefone × CPF — a mesma regra nos dois capturadores", () => {
	it("sem pedido de CPF, o número ambíguo é TELEFONE", () => {
		expect(decidirCpfDoTexto(AMBIGUO, { pedidoDeCpf: false })).toEqual({ outcome: "none" });
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: AMBIGUO, pedidoDeCpf: false })).toBe(true);
	});

	it("logo depois do pedido de CPF, o mesmo número é lido como CPF", () => {
		expect(decidirCpfDoTexto(AMBIGUO, { pedidoDeCpf: true })).toEqual({
			outcome: "captured",
			cpf: AMBIGUO,
		});
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: AMBIGUO, pedidoDeCpf: true })).toBe(false);
	});

	it("o cliente DECLARAR o dado vence a cara de celular, com ou sem pedido", () => {
		for (const pedidoDeCpf of [false, true]) {
			expect(decidirCpfDoTexto(`meu cpf é ${AMBIGUO}`, { pedidoDeCpf })).toEqual({
				outcome: "captured",
				cpf: AMBIGUO,
			});
		}
	});

	it("CPF que não tem cara de celular é CPF em qualquer contexto", () => {
		for (const pedidoDeCpf of [false, true]) {
			expect(decidirCpfDoTexto(CPF, { pedidoDeCpf })).toEqual({
				outcome: "captured",
				cpf: CPF,
			});
		}
	});

	it("número comprido que não fecha como CPF só é 'não confere' quando foi pedido", () => {
		// Sem pedido, pode ser telefone, valor, ano: quem responde é o modelo.
		expect(decidirCpfDoTexto("11987654321", { pedidoDeCpf: false }).outcome).toBe("none");
		expect(decidirCpfDoTexto("11987654321", { pedidoDeCpf: true }).outcome).toBe("invalid");
	});

	it("a palavra 'cpf' basta para declarar; telefone ditado segue telefone", () => {
		expect(decidirCpfDoTexto("meu celular é 11 98765-4321", { pedidoDeCpf: false }).outcome).toBe(
			"none",
		);
		expect(decidirCpfDoTexto("qual o valor? quero um de 80 mil", { pedidoDeCpf: false })).toEqual({
			outcome: "none",
		});
	});

	it("a negação do CPF não declara o número — ele continua TELEFONE", () => {
		// Achado 4 da pré-auditoria: o cliente RECUSA o CPF e dita o telefone na
		// mesma fala. A palavra "cpf" mora na oração anterior, negada, e não diz
		// nada sobre o número que vem depois dela.
		const negacao = "não tenho cpf, meu telefone é (11) 90000-0083";
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: negacao, pedidoDeCpf: false })).toBe(true);
		// Nem logo depois do pedido de CPF: ele está recusando o dado, e o número
		// que ele deu é o telefone — lido como CPF, o telefone se perde e a
		// administradora recebe um CPF que não é dele.
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: negacao, pedidoDeCpf: true })).toBe(true);
		for (const pedidoDeCpf of [false, true]) {
			expect(
				decidirCpfDoTexto("não tenho cpf, meu telefone é 11900000083", { pedidoDeCpf }),
			).toEqual({ outcome: "none" });
			// A negação conta mesmo sem a vírgula que separa as orações.
			expect(
				celularEhTelefone({ digitos: AMBIGUO, texto: `não tenho cpf ${AMBIGUO}`, pedidoDeCpf }),
			).toBe(true);
		}
	});

	it("a declaração de CPF vale LIGADA ao número, não no texto todo", () => {
		// A declaração colada no número vale nos dois contextos.
		for (const pedidoDeCpf of [false, true]) {
			expect(celularEhTelefone({ digitos: AMBIGUO, texto: `cpf: ${AMBIGUO}`, pedidoDeCpf })).toBe(
				false,
			);
			expect(decidirCpfDoTexto(`meu cpf é ${AMBIGUO}`, { pedidoDeCpf })).toEqual({
				outcome: "captured",
				cpf: AMBIGUO,
			});
		}
		// Duas identidades na MESMA fala: o "cpf" da primeira oração não declara o
		// número da segunda, que vem anunciado como telefone.
		const duas = `meu cpf é ${CPF}, meu telefone é ${AMBIGUO}`;
		expect(celularEhTelefone({ digitos: AMBIGUO, texto: duas, pedidoDeCpf: false })).toBe(true);
		expect(decidirCpfDoTexto(duas, { pedidoDeCpf: false })).toEqual({
			outcome: "captured",
			cpf: CPF,
		});
	});

	it("DDD entre parênteses não vira 'CPF inválido' para quem recusou o CPF", () => {
		// Pendência do bloco CCAP2: o ")" quebrava o candidato, o número não
		// existia como número e a fala caía em `looksLikeCpfAttempt` — quem tinha
		// recusado o CPF e ditado o celular ouvia "confere os números".
		const comParenteses = "não tenho CPF. meu celular é (11) 90000-0083";
		for (const pedidoDeCpf of [false, true]) {
			expect(decidirCpfDoTexto(comParenteses, { pedidoDeCpf })).toEqual({ outcome: "none" });
		}
		// A mesma fala sem os parênteses responde o mesmo: a pontuação é do
		// cliente, não do número.
		expect(
			decidirCpfDoTexto("não tenho CPF. meu celular é 11 90000-0083", { pedidoDeCpf: true }),
		).toEqual({ outcome: "none" });
		// Número sozinho depois do pedido é resposta ao pedido, com ou sem
		// parênteses: o desempate não depende de como ele foi digitado.
		expect(decidirCpfDoTexto("(11) 90000-0083", { pedidoDeCpf: true })).toEqual(
			decidirCpfDoTexto(AMBIGUO, { pedidoDeCpf: true }),
		);
		// O CPF declarado ANTES de um telefone entre parênteses continua sendo o
		// dado capturado: o parêntese não pode colar os dois números.
		expect(
			decidirCpfDoTexto(`meu cpf é 529.982.247-25 (11) 90000-0083`, { pedidoDeCpf: true }),
		).toEqual({ outcome: "captured", cpf: CPF });
		// E o CPF formatado declarado é lido com a pontuação que o cliente usa.
		expect(decidirCpfDoTexto("meu cpf é 529.982.247-25", { pedidoDeCpf: true })).toEqual({
			outcome: "captured",
			cpf: CPF,
		});
	});

	it("só o pedido de CPF na última fala do agente abre o contexto", () => {
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "qual seu CPF?" })).toBe(true);
		expect(pedidoDeCpfNoUltimoBalao({ role: "assistant", content: "qual valor você quer?" })).toBe(
			false,
		);
		expect(pedidoDeCpfNoUltimoBalao({ role: "user", content: "qual seu CPF?" })).toBe(false);
		expect(pedidoDeCpfNoUltimoBalao(null)).toBe(false);
	});

	it("exibição e DDD: lista fechada da Anatel, 11 dígitos + 9º dígito", () => {
		expect(dddValido("11")).toBe(true);
		expect(dddValido("28")).toBe(true);
		expect(dddValido("26")).toBe(false);
		expect(ehCelularBR(AMBIGUO)).toBe(true);
		expect(ehCelularBR(CPF)).toBe(false);
		expect(extractCpf(`meu cpf é ${CPF}`)).toBe(CPF);
	});
});
