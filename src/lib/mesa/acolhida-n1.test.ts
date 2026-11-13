// Bloco A — a acolhida do turno inline quando o atendimento existe e NINGUÉM
// assumiu. O caso real (dev, 2026-11): o cliente escreve "Uns R$ 250 mil" e
// recebe "Mensagem enviada para Consultor. Aguarde a resposta aqui." — o agente
// calou e nenhum humano estava do outro lado.
//
// O que este teste protege: a voz da acolhida (não a da venda), o nome que não
// se inventa, a hora como fato e o próximo passo (P0).

import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

import {
	PREFIXO_AVISO_ENCAMINHAMENTO,
	buildAcolhidaSemDonoDirective,
	ehFalaDaMesa,
	marcarAcolhidaInline,
} from "./acolhida-n1";

const AGORA = new Date("2026-11-05T04:12:00Z"); // 01:12 em America/Sao_Paulo

const PROPOSTA = {
	administradora: "ITAÚ",
	creditValue: 211258,
	monthlyPayment: 5445.27,
	termMonths: 47,
};

const meta = (over: Partial<ConversationMetadata> = {}): ConversationMetadata => ({
	...over,
});

describe("buildAcolhidaSemDonoDirective — a voz de quem acolhe", () => {
	it("diz que ninguém assumiu e que o pedido já está com a mesa", () => {
		const d = buildAcolhidaSemDonoDirective(meta(), { proposta: null, agora: AGORA });

		expect(d).toMatch(/NINGUÉM assumiu/i);
		expect(d).toMatch(/já está com a mesa/i);
	});

	it("traz a hora local de Brasília como FATO — e não promete prazo", () => {
		const d = buildAcolhidaSemDonoDirective(meta(), { proposta: null, agora: AGORA });

		expect(d).toContain("01:12");
		expect(d).toContain("America/Sao_Paulo");
		expect(d.toLowerCase()).toContain("não prometa horário");
	});

	it("com proposta registrada, diz que ela é real e pode ser confirmada", () => {
		const d = buildAcolhidaSemDonoDirective(meta({ contractClosed: true }), {
			proposta: PROPOSTA,
			agora: AGORA,
		});

		expect(d).toContain("211.258");
		expect(d).toContain("ITAÚ");
		expect(d).toContain("registrada e é real");
	});

	it("sem proposta registrada, diz que ela NÃO existe", () => {
		const d = buildAcolhidaSemDonoDirective(meta(), { proposta: null, agora: AGORA });

		expect(d).toContain("NÃO há proposta registrada");
		expect(d).not.toContain("R$");
	});

	it("o turno é SÓ acolher: sem retomar venda, sem cota nova, sem pedir dado, com próximo passo", () => {
		const d = buildAcolhidaSemDonoDirective(meta(), { proposta: PROPOSTA, agora: AGORA });

		expect(d.toLowerCase()).toContain("só acolher");
		expect(d).toContain("próximo passo");
		expect(d.toLowerCase()).toContain("não retome a venda");
		expect(d.toLowerCase()).toContain("não ofereça cota nova");
		expect(d.toLowerCase()).toContain("não peça dado");
	});

	it("nunca inventa nome: sem \"Consultor\" e sem chamar o atendente por nome", () => {
		for (const d of [
			buildAcolhidaSemDonoDirective(meta(), { proposta: null, agora: AGORA }),
			buildAcolhidaSemDonoDirective(meta({ contractClosed: true }), {
				proposta: PROPOSTA,
				agora: AGORA,
			}),
		]) {
			expect(d).not.toContain("Consultor");
			expect(d.toLowerCase()).toContain("invente vocativo");
		}
	});
});

describe("marcarAcolhidaInline", () => {
	it("grava lastAt sem mexer em attempts (quem conta é o worker)", () => {
		const antes = marcarAcolhidaInline(meta(), AGORA);
		expect(antes.acolhidaN1).toEqual({ attempts: 0, lastAt: AGORA.getTime() });

		const depois = marcarAcolhidaInline(antes, new Date(AGORA.getTime() + 60_000));
		expect(depois.acolhidaN1?.attempts).toBe(0);
		expect(depois.acolhidaN1?.lastAt).toBe(AGORA.getTime() + 60_000);

		const umaJaFeita = marcarAcolhidaInline(
			meta({ acolhidaN1: { attempts: 1, lastAt: AGORA.getTime() - 1000 } }),
			AGORA,
		);
		expect(umaJaFeita.acolhidaN1).toEqual({ attempts: 1, lastAt: AGORA.getTime() });
	});
});

describe("ehFalaDaMesa — o que NÃO é gente da mesa", () => {
	it("o aviso de encaminhamento do servidor não conta como fala da mesa", () => {
		const aviso = `${PREFIXO_AVISO_ENCAMINHAMENTO} Marina. Aguarde a resposta aqui.`;
		expect(ehFalaDaMesa({ role: "assistant", personaId: null, content: aviso })).toBe(false);
		expect(PREFIXO_AVISO_ENCAMINHAMENTO).toBe("Mensagem enviada para");
	});

	it("a fala real do atendente continua contando", () => {
		expect(ehFalaDaMesa({ role: "assistant", personaId: null, content: "Oi, Ana! Já vou ver." })).toBe(
			true,
		);
		expect(ehFalaDaMesa({ role: "assistant", personaId: "vendedor", content: "Oi!" })).toBe(false);
		expect(ehFalaDaMesa({ role: "user", personaId: null, content: "Oi" })).toBe(false);
	});
});
