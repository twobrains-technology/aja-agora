// O corpo do alerta é o produto inteiro deste endpoint: se ele não contar a
// história do turno, o e-mail vira ruído e ninguém abre o próximo.
//
// O caso que serve de fixture é o real: produção, WhatsApp, 2026-08-13, trace
// `f83ff29acd103b12401baaea055f4910` — `search_groups` fora do toolset, o
// agente vendeu isso ao cliente como problema técnico, o funil parou no gate
// `credit` e os quatro juízes aprovaram.
import { describe, expect, it } from "vitest";
import { assuntoDoAlerta, corpoHtml, corpoTexto } from "./corpo";
import type { Dossie } from "./dossie";

const ALERTA = {
	monitorId: "mon-1",
	projectId: "cmsicnldl0006mv07gy700qy6",
	permalink: "https://langfuse.twobrainstechnology.com/project/p/monitors/mon-1",
	message: { title: "tool_falhou acima de 0", body: "média 0,33 na última hora (limite 0)" },
	severity: "ALERT",
	timestamp: "2026-08-13T03:00:00.000Z",
	fromTimestamp: "2026-08-13T02:00:00.000Z",
	toTimestamp: "2026-08-13T03:00:00.000Z",
};

const DOSSIE: Dossie = {
	alerta: ALERTA,
	turnosOmitidos: 0,
	baseUrl: "https://langfuse.twobrainstechnology.com",
	turnos: [
		{
			traceId: "f83ff29acd103b12401baaea055f4910",
			observationId: "3f8f9bda742660d2",
			sessionId: "a68b1945-a7de-48e5-849d-5e35c18a4c8d",
			userId: "wa:556292496793",
			canal: "whatsapp",
			inicio: "2026-08-13T02:54:01.814Z",
			entrada: "Isso mesmo",
			entradaEhDirective: false,
			saida: "Infelizmente tive um problema na busca.",
			toolsChamadas: [],
			toolsQueFalharam: ["search_groups"],
			erros: [],
			scores: {
				tool_falhou: 1,
				tool_falha_nome: "search_groups",
				gate_afundado: "credit",
				judge_resolved: 1,
				turno_mudo: 0,
			},
			url: "https://langfuse.twobrainstechnology.com/project/p/traces/f83ff29acd103b12401baaea055f4910",
		},
	],
};

describe("assunto", () => {
	it("diz o defeito, a severidade e o canal sem precisar abrir", () => {
		const a = assuntoDoAlerta(DOSSIE);
		expect(a).toContain("ALERT");
		expect(a).toContain("tool_falhou acima de 0");
		expect(a).toContain("whatsapp");
	});
});

describe("corpo em texto (é o que vira a descrição da ocorrência no Cortex)", () => {
	const t = corpoTexto(DOSSIE);

	it("traz a fala dos dois lados — é isso que faz o alerta ser lido", () => {
		expect(t).toContain("CLIENTE: Isso mesmo");
		expect(t).toContain("AGENTE: Infelizmente tive um problema na busca.");
	});

	it("nomeia a tool que falhou e o gate que afundou", () => {
		expect(t).toContain("TOOLS QUE FALHARAM: search_groups");
		expect(t).toContain("gate_afundado=credit");
	});

	it("leva o link do trace e da sessão", () => {
		expect(t).toContain("f83ff29acd103b12401baaea055f4910");
		expect(t).toContain("a68b1945-a7de-48e5-849d-5e35c18a4c8d");
	});

	// Directive do servidor e fala de cliente parecem a mesma coisa no campo
	// `input`. Confundir os dois faz o leitor culpar o cliente por um texto que
	// o próprio sistema escreveu.
	it("distingue directive do servidor de fala do cliente", () => {
		const comDirective = corpoTexto({
			...DOSSIE,
			turnos: [{ ...DOSSIE.turnos[0], entradaEhDirective: true }],
		});
		expect(comDirective).toContain("DIRECTIVE DO SERVIDOR:");
		expect(comDirective).not.toContain("CLIENTE: Isso mesmo");
	});

	it("turno mudo é dito com todas as letras, não some", () => {
		const mudo = corpoTexto({ ...DOSSIE, turnos: [{ ...DOSSIE.turnos[0], saida: "" }] });
		expect(mudo).toContain("não escreveu nada — turno mudo");
	});

	// Ausência de dado ≠ dado ausente: sem esta frase o leitor conclui que a
	// janela estava limpa quando, na verdade, a consulta não respondeu.
	it("dossiê vazio explica que NÃO conseguiu recuperar, em vez de parecer vazio", () => {
		const vazio = corpoTexto({ ...DOSSIE, turnos: [] });
		expect(vazio).toContain("Nenhum turno pôde ser recuperado");
		expect(vazio).toContain(ALERTA.permalink);
	});

	// Corte silencioso faz o relatório parecer completo sem ser.
	it("declara quantos turnos ficaram de fora", () => {
		const cortado = corpoTexto({ ...DOSSIE, turnosOmitidos: 7 });
		expect(cortado).toContain("+7 turno(s)");
	});
});

describe("corpo em HTML", () => {
	it("escapa o que veio da conversa (o texto do cliente é entrada não confiável)", () => {
		const html = corpoHtml({
			...DOSSIE,
			turnos: [{ ...DOSSIE.turnos[0], entrada: '<img src=x onerror="alert(1)">' }],
		});
		expect(html).not.toContain("<img src=x");
		expect(html).toContain("&lt;img src=x");
	});

	it("leva o link do trace clicável", () => {
		expect(corpoHtml(DOSSIE)).toContain(`href="${DOSSIE.turnos[0].url}"`);
	});
});
