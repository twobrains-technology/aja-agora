/**
 * Camada 1 — FIX-5 (teste manual Kairo 2026-06-05): o TEXTO do opt-in de
 * WhatsApp vazava pré-reveal.
 *
 * Bug real (print): no meio da qualificação (entre gates lance e
 * lance-value) o agent escreveu "Posso anotar seu WhatsApp? Assim a gente já
 * garante seu acesso..." SEM artifact pra responder — o turno ficou com 2
 * perguntas e a do WhatsApp órfã. O guard (whatsapp-optin-guard) segura o
 * ARTIFACT pré-reveal, mas a seção do system prompt com as narrativas de
 * opt-in ficava SEMPRE visível — o modelo improvisava o pedido em texto.
 *
 * Fix: a seção WhatsApp sai do SPECIALIST_BASE_PROMPT (estável) e vira bloco
 * DINÂMICO por estágio: "locked" (pré-reveal — proibição explícita),
 * "open" (pós-reveal, optin pendente — narrativa + tool), "done" (já
 * tratado — não voltar ao assunto).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	deriveWhatsappOptinStage,
	SPECIALIST_BASE_PROMPT,
	whatsappOptinSection,
} from "./system-prompt";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-5 — whatsappOptinSection por estágio", () => {
	it("locked (pré-reveal): proíbe mencionar WhatsApp e não vaza narrativas de optin", () => {
		const s = whatsappOptinSection("locked");
		expect(s).toMatch(/PROIBIDO/);
		expect(s.toLowerCase()).toMatch(/whatsapp/);
		// As frases-modelo do optin NÃO podem estar visíveis pré-reveal — eram
		// exatamente elas que o modelo imitava cedo demais.
		expect(s).not.toMatch(/Posso anotar seu WhatsApp/i);
		expect(s).not.toMatch(/me compartilha seu WhatsApp/i);
		// Número espontâneo do usuário ainda persiste (não é pedir).
		expect(s).toMatch(/save_contact_whatsapp/);
	});

	it("open (pós-reveal, pendente): narrativa estratégica + present_whatsapp_optin", () => {
		const s = whatsappOptinSection("open");
		expect(s).toMatch(/present_whatsapp_optin/);
		expect(s).toMatch(/Posso anotar seu WhatsApp/i);
		expect(s).toMatch(/present_simulation_result|present_recommendation_card/);
	});

	it("done: assunto encerrado — não re-oferecer", () => {
		const s = whatsappOptinSection("done");
		expect(s).toMatch(/J[ÁA] (foi )?(tratado|resolvido|oferecido)/i);
		expect(s).toMatch(/N[ÃA]O/);
		expect(s).not.toMatch(/Posso anotar seu WhatsApp\? Assim/);
	});

	it("em TODO estágio: nunca 2 perguntas no mesmo turno (regra do bug)", () => {
		// O turno do bug tinha pergunta de optin + pergunta de gate juntas.
		for (const stage of ["locked", "open", "done"] as const) {
			expect(whatsappOptinSection(stage).toLowerCase()).toMatch(
				/uma (única |unica )?pergunta|nunca.*duas perguntas|n[ãa]o.*junto de outra pergunta/,
			);
		}
	});
});

describe("FIX-5 — deriveWhatsappOptinStage(meta)", () => {
	it("sem reveal → locked (mesmo com optinShown false/undefined)", () => {
		expect(deriveWhatsappOptinStage({})).toBe("locked");
		expect(deriveWhatsappOptinStage({ revealCompleted: false })).toBe("locked");
	});

	it("reveal completo + optin pendente → open", () => {
		expect(deriveWhatsappOptinStage({ revealCompleted: true })).toBe("open");
	});

	it("reveal completo + optin já mostrado → done", () => {
		expect(
			deriveWhatsappOptinStage({ revealCompleted: true, whatsappOptinShown: true }),
		).toBe("done");
	});
});

describe("FIX-5 — o prompt ESTÁVEL não carrega mais o optin incondicional", () => {
	it("SPECIALIST_BASE_PROMPT sem narrativas de optin nem seção incondicional", () => {
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/Posso anotar seu WhatsApp/i);
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/### WhatsApp — ofereca DEPOIS/);
	});
});

describe("FIX-5 — acoplamento (o estágio chega ao modelo de verdade)", () => {
	it("builder repassa whatsappOptinStage pro buildSpecialistPrompt", () => {
		const src = readSource("src/lib/agent/agents/builder.ts");
		expect(src).toMatch(/whatsappOptinStage/);
	});

	it("resolveAgent deriva o estágio do meta da conversa", () => {
		const src = readSource("src/lib/agent/agents/index.ts");
		expect(src).toMatch(/deriveWhatsappOptinStage/);
	});
});
