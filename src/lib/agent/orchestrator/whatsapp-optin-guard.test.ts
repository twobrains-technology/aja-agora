import { describe, expect, it } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

// BUG-OPTIN-ENGOLE-GATES (2026-06-04, E2E real, achado 1): no turno de "Sim,
// tenho reserva" o agente disparou present_whatsapp_optin por conta própria —
// o artifact ativou o guard anti-atropelo e SUPRIMIU os gates lance-value/
// lance-embutido/identify (o funil do docx morria ali, intermitente). A regra
// de produto sempre foi "optin APÓS apresentar a recomendação" — agora é
// DETERMINÍSTICA: pré-reveal o optin é suprimido, não importa o que o modelo
// alucine. Pós-reveal vale o dedupe PF-07 de sempre.

describe("shouldEmitWhatsappOptin — pré-reveal NUNCA (BUG-OPTIN-ENGOLE-GATES)", () => {
	it("NÃO emite durante a qualificação (revealCompleted ausente)", () => {
		expect(shouldEmitWhatsappOptin({})).toBe(false);
		expect(
			shouldEmitWhatsappOptin({
				qualifyAnswers: { hasLance: "yes" },
			} as ConversationMetadata),
		).toBe(false);
	});

	it("NÃO emite com revealCompleted=false explícito", () => {
		expect(shouldEmitWhatsappOptin({ revealCompleted: false })).toBe(false);
	});

	it("emite pós-reveal quando ainda não mostrado", () => {
		expect(shouldEmitWhatsappOptin({ revealCompleted: true })).toBe(true);
		expect(
			shouldEmitWhatsappOptin({ revealCompleted: true, whatsappOptinShown: false }),
		).toBe(true);
	});
});

describe("shouldEmitWhatsappOptin — PF-07 guard de duplicação (pós-reveal)", () => {
	it("NÃO emite quando meta.whatsappOptinShown é true", () => {
		const meta: ConversationMetadata = { revealCompleted: true, whatsappOptinShown: true };
		expect(shouldEmitWhatsappOptin(meta)).toBe(false);
	});

	it("NÃO emite mesmo se user já recusou (declined → shown=true)", () => {
		const meta: ConversationMetadata = {
			revealCompleted: true,
			whatsappOptinShown: true,
			whatsappOptinDeclined: true,
		};
		expect(shouldEmitWhatsappOptin(meta)).toBe(false);
	});
});
