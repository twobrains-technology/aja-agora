import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { linhaDeHandoff, linhaFinalDoHandoff, semPromessa } from "./handoff";

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
	it("o balão do handoff é UMA linha — a confirmação com prazo não sai", () => {
		const balao = linhaFinalDoHandoff({
			texto:
				"Entendido! Vou abrir a conversa com um especialista para você agora.\n\nCaso aberto! Um especialista vai entrar em contato com você em breve.",
			nome: "Marcos",
			clientePediu: true,
			casoAberto: true,
		});
		expect(balao.split("\n").length).toBeLessThanOrEqual(2);
		expect(semPromessa(balao)).toBe(true);
		expect(balao).toContain("abri o caso pra nossa mesa");
		// Com o nome faltando, a pergunta do nome (o que destrava o caso) continua.
		// Sem lead não há caso: a linha honesta pede o nome, não afirma que abriu.
		const semNome = linhaFinalDoHandoff({
			texto: "Vou abrir o caso.\nQual é o seu nome?",
			nome: null,
			clientePediu: true,
			casoAberto: false,
		});
		expect(semNome).toBe("Qual é o seu nome?");
		expect(semNome).toContain("Qual é o seu nome?");
		expect(semPromessa(semNome)).toBe(true);
	});

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
	it("o turno escreve a LINHA do handoff, não a prosa do modelo", () => {
		const turno = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		expect(turno).toMatch(/linhaFinalDoHandoff\(\{[^}]*texto: bruto[\s\S]*?casoAberto/);
		// O balão sai pela linha da casa tanto quando o caso foi aberto quanto quando o modelo
		// escreve prosa de promessa antes de abrir.
		expect(turno).toMatch(/handoff:[\s\S]*?RE_DE_PROMESSA\.test\(pendente\)/);
		// Uma linha por turno: a segunda prosa de handoff não vira segunda mensagem.
		expect(turno).toMatch(/linhaDeHandoffEmitida/);

		const tools = readFileSync(new URL("./tools-livres.ts", import.meta.url).pathname, "utf8");
		expect(tools).toMatch(/ctx\.casoAbertoNesteTurno\?\.\(\);/);
		// O aviso de "caso aberto" que sai no balão é o da casa, não a frase do modelo.
		expect(turno).not.toMatch(/Caso aberto!/);
	});

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
