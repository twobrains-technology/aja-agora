// FIX-27 (bloco-n, teste manual Kairo 2026-06-11): o opt-in pediu o WhatsApp
// pela 3ª vez (lead form + identify já tinham coletado), input vazio, no meio
// de um fechamento com erro Bevi pendente. deriveWhatsappOptinStage só olhava
// revealCompleted+whatsappOptinShown — não enxergava telefone já capturado nem
// o retry de fechamento. Stage novo "confirm" (1-clique, sem re-coleta).
import { describe, expect, it } from "vitest";
import { maskPhoneForDisplay } from "@/lib/conversation/identity";
import { shouldEmitWhatsappOptin } from "./orchestrator/whatsapp-optin-guard";
import { deriveWhatsappOptinStage, whatsappOptinSection } from "./system-prompt";

describe("FIX-27 — deriveWhatsappOptinStage enxerga telefone capturado + retry", () => {
	it("telefone já capturado (pós-reveal, opt-in pendente) → confirm (não re-coleta)", () => {
		expect(
			deriveWhatsappOptinStage({ revealCompleted: true, contactPhone: "(62) 9...-6793" }),
		).toBe("confirm");
	});

	it("sem telefone capturado → open (coleta normal — comportamento legado)", () => {
		expect(deriveWhatsappOptinStage({ revealCompleted: true })).toBe("open");
	});

	it("fechamento com erro Bevi pendente → done (suprime opt-in: assunto é re-tentar)", () => {
		expect(
			deriveWhatsappOptinStage({
				revealCompleted: true,
				contactPhone: "(62) 9...-6793",
				contractRetryPending: true,
			}),
		).toBe("done");
	});

	it("opt-in já respondido vence o telefone capturado → done", () => {
		expect(
			deriveWhatsappOptinStage({
				revealCompleted: true,
				contactPhone: "(62) 9...-6793",
				whatsappOptinShown: true,
			}),
		).toBe("done");
	});

	it("pré-reveal → locked (mesmo com telefone capturado)", () => {
		expect(deriveWhatsappOptinStage({ contactPhone: "(62) 9...-6793" })).toBe("locked");
	});
});

describe("FIX-27 — whatsappOptinSection('confirm')", () => {
	const s = whatsappOptinSection("confirm");

	it("instrui CONFIRMAR o canal já conhecido, sem re-pedir o número", () => {
		expect(s.toLowerCase()).toMatch(/confirm/);
		expect(s).toMatch(/present_whatsapp_optin/);
		// NÃO pode mandar pedir/coletar o número de novo (ele já foi informado).
		expect(s).not.toMatch(/me compartilha seu WhatsApp/i);
		expect(s).not.toMatch(/anotar seu WhatsApp/i);
	});

	it("mantém a regra de UMA pergunta acionável por turno", () => {
		expect(s.toLowerCase()).toMatch(/uma (única |unica )?pergunta|n[ãa]o.*duas perguntas/);
	});
});

describe("FIX-27 — shouldEmitWhatsappOptin suprime em retry de fechamento", () => {
	it("NÃO emite quando há fechamento com erro Bevi pendente (assunto é re-tentar)", () => {
		expect(shouldEmitWhatsappOptin({ revealCompleted: true, contractRetryPending: true })).toBe(
			false,
		);
	});

	it("emite normalmente pós-reveal sem retry pendente", () => {
		expect(shouldEmitWhatsappOptin({ revealCompleted: true })).toBe(true);
	});
});

describe("FIX-27 — maskPhoneForDisplay (LGPD: número mascarado no meta/prompt)", () => {
	it("mascara mantendo DDD e últimos 4 ('62992496793' → '(62) 9...-6793')", () => {
		expect(maskPhoneForDisplay("62992496793")).toBe("(62) 9...-6793");
	});

	it("aceita número já formatado", () => {
		expect(maskPhoneForDisplay("(62) 99249-6793")).toBe("(62) 9...-6793");
	});

	it("número curto/invalido → string vazia (não exibe lixo)", () => {
		expect(maskPhoneForDisplay("123")).toBe("");
		expect(maskPhoneForDisplay("")).toBe("");
	});
});
