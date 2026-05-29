import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT } from "@/lib/agent/system-prompt";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import { DECISION_PROMPT_OPTIONS, DECISION_PROMPT_QUESTION } from "@/lib/chat/types";
import { artifactToWhatsApp, decisionPromptToWhatsApp } from "@/lib/whatsapp/formatter";

// Camada 1 — card de decisão "Esse plano faz sentido?" (jornada do .docx etapa 4).

describe("decision_prompt — opções canônicas do doc", () => {
	it("tem exatamente as 3 ações do doc", () => {
		expect(DECISION_PROMPT_OPTIONS.map((o) => o.intent)).toEqual([
			"contratar",
			"outras",
			"especialista",
		]);
		expect(DECISION_PROMPT_OPTIONS.map((o) => o.label)).toEqual([
			"Sim, quero contratar agora",
			"Quero ver outras opções",
			"Quero falar com um especialista",
		]);
	});

	it("pergunta canônica está definida", () => {
		expect(DECISION_PROMPT_QUESTION).toMatch(/faz sentido/i);
	});
});

describe("present_decision_prompt é tool de apresentação registrada", () => {
	it("está em PRESENTATION_TOOLS (senão o orchestrator não intercepta o artifact)", () => {
		expect(PRESENTATION_TOOLS.has("present_decision_prompt")).toBe(true);
	});
});

describe("decision_prompt → WhatsApp", () => {
	it("artifactToWhatsApp NÃO dropa decision_prompt (cobertura)", () => {
		expect(artifactToWhatsApp("decision_prompt", {})).not.toBeNull();
	});

	it("gera 3 botões com títulos ≤ 20 chars (limite Meta API)", () => {
		const wa = decisionPromptToWhatsApp({ administradora: "RODOBENS" });
		const buttons = (
			wa.interactive as { action: { buttons: { reply: { id: string; title: string } }[] } }
		).action.buttons;
		expect(buttons).toHaveLength(3);
		for (const b of buttons) {
			expect(
				b.reply.title.length,
				`título "${b.reply.title}" deve caber em 20 chars`,
			).toBeLessThanOrEqual(20);
			expect(b.reply.id).toMatch(/^decision_/);
		}
	});
});

describe("prompt — roteamento das 3 ações do card de decisão", () => {
	it("present_decision_prompt está documentado no prompt com as 3 rotas", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/present_decision_prompt/);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/falar com um especialista[\s\S]{0,80}suggest_handoff/i);
	});

	it("'contratar agora' é gatilho de present_lead_form no prompt", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/contratar agora/i);
		// o gatilho 'contratar' vive perto do present_lead_form
		expect(
			/contratar[\s\S]{0,600}present_lead_form|present_lead_form[\s\S]{0,600}contratar/i.test(
				SPECIALIST_BASE_PROMPT,
			),
		).toBe(true);
	});
});
