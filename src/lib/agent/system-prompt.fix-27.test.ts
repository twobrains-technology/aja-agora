// FIX-27 (bloco-n, teste manual Kairo 2026-06-11): o opt-in pediu o WhatsApp
// pela 3ª vez (lead form + identify já tinham coletado), input vazio, no meio
// de um fechamento com erro Bevi pendente. deriveWhatsappOptinStage só olhava
// revealCompleted+whatsappOptinShown — não enxergava telefone já capturado nem
// o retry de fechamento. Stage "confirm" (1-clique, sem re-coleta) resolveu.
//
// FIX-280 (loop r9, baseline Sonnet 3/10, G4): "open"/"confirm" saíram de
// `deriveWhatsappOptinStage`/`whatsappOptinSection` — a granularidade (número
// já conhecido? fechamento com retry pendente?) migrou pra dentro do próprio
// orchestrator (`shouldEmitWhatsappOptin` decide SE emite; o directive
// `buildWhatsappOptinDirective("open"|"confirm")`, orchestrator/directives.ts,
// decide a narrativa) — o LLM não decide mais NADA sobre o opt-in em turno
// normal, então a seção ambiente (whatsappOptinSection) só precisa saber
// "pré-reveal" (locked) vs "resto" (done, o sistema cuida). Os testes de
// shouldEmitWhatsappOptin/maskPhoneForDisplay abaixo continuam valendo — a
// LÓGICA de quando emitir não mudou, só QUEM a executa (servidor, não LLM).
import { describe, expect, it } from "vitest";
import { maskPhoneForDisplay } from "@/lib/conversation/identity";
import { shouldEmitWhatsappOptin } from "./orchestrator/whatsapp-optin-guard";
import { deriveWhatsappOptinStage } from "./system-prompt";

describe("FIX-280 — deriveWhatsappOptinStage colapsada (só locked/done — sistema decide o resto)", () => {
	it("pós-reveal, mesmo com telefone já capturado → done (LLM nunca mais decide 'confirm')", () => {
		expect(
			deriveWhatsappOptinStage({ revealCompleted: true, contactPhone: "(62) 9...-6793" }),
		).toBe("done");
	});

	it("pós-reveal, sem telefone capturado → done (LLM nunca mais decide 'open')", () => {
		expect(deriveWhatsappOptinStage({ revealCompleted: true })).toBe("done");
	});

	it("pré-reveal → locked (mesmo com telefone capturado)", () => {
		expect(deriveWhatsappOptinStage({ contactPhone: "(62) 9...-6793" })).toBe("locked");
	});
});

describe("FIX-27 — shouldEmitWhatsappOptin suprime em retry de fechamento", () => {
	it("NÃO emite quando há fechamento com erro Bevi pendente (assunto é re-tentar)", () => {
		expect(
			shouldEmitWhatsappOptin({
				revealCompleted: true,
				contractFormDispatched: true,
				contractRetryPending: true,
			}),
		).toBe(false);
	});

	// FIX-303: o gatilho migrou de revealCompleted pro FECHO
	// (contractFormDispatched) — sem retry pendente, no fecho, emite normal.
	it("emite normalmente no fecho (proposta apresentada) sem retry pendente", () => {
		expect(
			shouldEmitWhatsappOptin({ revealCompleted: true, contractFormDispatched: true }),
		).toBe(true);
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
