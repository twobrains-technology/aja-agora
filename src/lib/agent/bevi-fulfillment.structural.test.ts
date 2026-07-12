import { describe, expect, it } from "vitest";
import { artifactToWhatsApp } from "@/lib/whatsapp/formatter";
import { SPECIALIST_BASE_PROMPT } from "./system-prompt";
import { PRESENTATION_TOOLS } from "./tools/ai-sdk";

// Camada 1 — anti-regressão estrutural do passo 5 "Contratar" (fechamento Bevi)
// + simulador-agulha. Asserts contra a fonte de produção (prompt/tools/formatter).

describe("passo 5 — roteamento no prompt", () => {
	it("'seguir agora' aponta pra present_contract_form (não mais lead_form puro)", () => {
		// DV-8 (QA 2026-07-11): "reserva" só pós-fechamento; o gatilho de avanço vira
		// "seguir agora" (supera o FIX-216, que tinha posto "reservar").
		const re = /seguir agora[\s\S]{0,400}present_contract_form/i;
		expect(SPECIALIST_BASE_PROMPT).toMatch(re);
	});

	it("o prompt explica que o sistema conduz oferta real → assinatura → documento", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/oferta\s+REAL/i);
		expect(SPECIALIST_BASE_PROMPT).toMatch(/present_contract_form/);
	});

	it("o prompt expõe o simulador-agulha (present_contemplation_dial)", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/present_contemplation_dial/);
		// sem vazar 'arraste o slider' (regra anti meta-narrativa de UI)
		expect(SPECIALIST_BASE_PROMPT).not.toMatch(/arraste o slider/i);
	});
});

describe("passo 5 — tools registradas como apresentação", () => {
	it("present_contract_form e present_contemplation_dial estão em PRESENTATION_TOOLS", () => {
		expect(PRESENTATION_TOOLS.has("present_contract_form")).toBe(true);
		expect(PRESENTATION_TOOLS.has("present_contemplation_dial")).toBe(true);
	});
});

describe("passo 5 — paridade WhatsApp (anti-drop)", () => {
	const types = [
		"contract_form",
		"real_offer",
		"signature_handoff",
		"document_upload",
		"contemplation_dial",
	];
	for (const t of types) {
		it(`${t} renderiza no WhatsApp (não dropa)`, () => {
			expect(artifactToWhatsApp(t, {})).not.toBeNull();
		});
	}

	it("real_offer no WhatsApp vira botão de confirmação", () => {
		const r = artifactToWhatsApp("real_offer", {
			administradora: "ANCORA",
			creditValue: 50000,
			monthlyPayment: 600,
			grupo: "540",
		});
		expect(r?.type).toBe("interactive");
		const txt = JSON.stringify(r);
		expect(txt).toContain("offer_confirm");
	});
});
