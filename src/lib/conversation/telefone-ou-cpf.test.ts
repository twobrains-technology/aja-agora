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
