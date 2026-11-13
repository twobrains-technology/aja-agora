// Bloco B — o aviso de encaminhamento do chat web.
//
// O caso real (print do operador): depois do card "Ver cartas nesse valor", o
// cliente escreveu "Uns R$ 250 mil" e a tela respondeu "Mensagem enviada para
// Consultor. Aguarde a resposta aqui." — nome inventado, nenhum próximo passo,
// e o aviso nem sequer ficava no histórico.
//
// O que este teste protege: nome REAL de quem assumiu, "Consultor" nunca, o
// prefixo que o `ehFalaDaMesa` reconhece e um próximo passo (P0).

import { describe, expect, it } from "vitest";
import { PREFIXO_AVISO_ENCAMINHAMENTO } from "@/lib/mesa/acolhida-n1";

import { avisoDeEncaminhamento } from "./aviso-de-encaminhamento";

describe("avisoDeEncaminhamento — quem atende, com nome de gente", () => {
	it("mostra o NOME REAL de quem assumiu", () => {
		const aviso = avisoDeEncaminhamento("Ana Paula");

		expect(aviso).toContain("Ana Paula");
	});

	it('nunca diz "Consultor" — nem quando é isso que chega', () => {
		expect(avisoDeEncaminhamento("Ana Paula")).not.toMatch(/consultor/i);
		expect(avisoDeEncaminhamento("Consultor")).not.toMatch(/consultor/i);
	});

	it("sem nome, não inventa vocativo: o destinatário vira o atendimento", () => {
		for (const semNome of [null, undefined, "", "   "]) {
			const aviso = avisoDeEncaminhamento(semNome);
			expect(aviso).toContain("atendimento");
			expect(aviso).not.toMatch(/consultor/i);
		}
	});

	it("começa no prefixo que o ehFalaDaMesa reconhece", () => {
		// `ehFalaDaMesa` faz `trimStart().startsWith(PREFIXO)`: qualquer markdown
		// ou espaço antes do prefixo faria o aviso do servidor passar por fala da
		// mesa, e a conversa nunca mais receberia acolhida.
		for (const nome of ["Ana Paula", null]) {
			const aviso = avisoDeEncaminhamento(nome);
			expect(aviso.trimStart().startsWith(PREFIXO_AVISO_ENCAMINHAMENTO)).toBe(true);
			expect(aviso.trimStart()).toBe(aviso);
		}
	});
});

describe("avisoDeEncaminhamento — P0: a conversa não morre no aviso", () => {
	it("carrega um próximo passo: o cliente pode seguir escrevendo por aqui", () => {
		const aviso = avisoDeEncaminhamento("Ana Paula");

		expect(aviso).toMatch(/continuar escrevendo por aqui/i);
		expect(aviso).toMatch(/chega/i);
	});

	it("não manda esperar seco nem promete prazo", () => {
		const aviso = avisoDeEncaminhamento("Ana Paula");

		expect(aviso).not.toMatch(/aguarde/i);
		// Nenhum número: prazo, horário e tempo de espera são dado que o servidor
		// não tem (não existe expediente cadastrado em lugar nenhum do código).
		expect(aviso).not.toMatch(/\d/);
		expect(aviso).not.toMatch(/\b(minuto|minutos|hora|horas|amanhã|hoje)\b/i);
	});

	it("o próximo passo existe mesmo sem nome", () => {
		const aviso = avisoDeEncaminhamento(null);

		expect(aviso).toMatch(/continuar escrevendo por aqui/i);
		expect(aviso).not.toMatch(/aguarde/i);
	});
});
