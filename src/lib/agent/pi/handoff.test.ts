import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { linhaDeHandoff, semPromessa } from "./handoff";

describe("o pedido de humano honra o pedido, sem promessa", () => {
	it("o caso medido (6d647263): as palavras prometidas não passam", () => {
		expect(semPromessa("Um especialista nosso está a caminho para conversar com você.")).toBe(
			false,
		);
		expect(semPromessa("Vou chamar um especialista para conversar com você.")).toBe(false);
	});

	it("pedido do cliente: uma linha, sem promessa, com o nome capturado", () => {
		const linha = linhaDeHandoff({ nome: "Marcos", clientePediu: true });
		expect(linha).toBe("Marcos, abri o caso pra nossa mesa. Um atendente humano assume por aqui.");
		expect(semPromessa(linha)).toBe(true);
		expect(linha.split("\n")).toHaveLength(1);
	});

	it("sugestão do agente (o cliente não pediu) mantém a recomendação", () => {
		const linha = linhaDeHandoff({ nome: null, clientePediu: false });
		expect(linha).toContain("recomendo conversar direto com nosso consultor humano");
	});

	// O tool não pode voltar a ser só uma flag + frase de promessa: ela abre o caso.
	it("`falar_com_humano` abre o caso, e o caso marca handed_off", () => {
		const tool = readFileSync(new URL("./tools-livres.ts", import.meta.url).pathname, "utf8");
		const corpo = tool.slice(
			tool.indexOf("const falar_com_humano"),
			tool.indexOf("const salvar_nome"),
		);
		expect(corpo).toContain("abrirCasoNaMesa(");
		expect(corpo).not.toMatch(/Especialista chamado/);

		const modulo = readFileSync(new URL("./handoff.ts", import.meta.url).pathname, "utf8");
		expect(modulo).toMatch(/set\(\{ status: "handed_off" \}\)/);
	});

	// Botão de confirmação depois de o cliente já ter pedido é burocracia.
	it("no WhatsApp, pedido do cliente não ganha botão de confirmação", () => {
		const adapter = readFileSync(
			new URL("../../whatsapp/adapter.ts", import.meta.url).pathname,
			"utf8",
		);
		const caso = adapter.slice(
			adapter.indexOf('case "handoff"'),
			adapter.indexOf('case "welcome-categories"'),
		);
		expect(caso).toContain('ev.reason === "pedido do cliente"');
		expect(caso).toContain("flushText()");
	});
});
