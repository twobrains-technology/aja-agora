// Camada 1 (FIX-116 / D11) — PARIDADE DES-1 no canal WhatsApp.
//
// DESVIO-ASSINATURA (docs/jornada/CONTEXT.md, DES-1): o link da proposta
// da API de Parceiro é o PDF da PROPOSTA de consórcio (S3, Content-Disposition:
// attachment) — NÃO um portal de assinatura. A assinatura/efetivação é etapa
// posterior da MESA. O web já cumpre (signature-handoff.tsx + .test.tsx proíbem
// /assinatura|assinar/i); o WhatsApp ficou pra trás prometendo "finalizar a
// assinatura" (formatter) e rotulando o link como "Assinatura digital" (resumo).
//
// REGRA de paridade: o MESMO regex que protege o web passa a valer no WhatsApp.

import { describe, expect, it } from "vitest";
import { buildContractSummaryText } from "@/lib/bevi/contract-summary";
import { signatureHandoffToWhatsApp } from "./formatter";

const LINK = "https://docs.aja.test/proposta.pdf";

describe("FIX-116 — WhatsApp apresenta PROPOSTA pronta, NÃO 'assinatura' (paridade DES-1)", () => {
	it("signatureHandoffToWhatsApp: não promete 'assinatura'/'assinar' (etapa da mesa)", () => {
		const wa = signatureHandoffToWhatsApp({
			administradora: "ÂNCORA",
			proposalUrl: LINK,
		});
		expect(wa.type).toBe("text");
		expect(wa.text ?? "").not.toMatch(/assinatura|assinar/i);
	});

	it("signatureHandoffToWhatsApp: apresenta a PROPOSTA pronta e traz o link", () => {
		const wa = signatureHandoffToWhatsApp({
			administradora: "ÂNCORA",
			proposalUrl: LINK,
		});
		expect(wa.text ?? "").toMatch(/proposta/i);
		expect(wa.text ?? "").toContain(LINK);
	});

	// A continuidade da Aja Agora é dita na mensagem ANTERIOR do fecho; aqui a
	// mensagem é sobre o documento, e cita a administradora do plano.
	it("signatureHandoffToWhatsApp: é sobre o documento, citando a administradora", () => {
		const wa = signatureHandoffToWhatsApp({
			administradora: "ÂNCORA",
			proposalUrl: LINK,
		});
		expect(wa.text ?? "").toMatch(/carta.*parcela.*prazo/i);
		expect(wa.text ?? "").toContain("ÂNCORA");
	});

	it("buildContractSummaryText: rótulo do link NÃO é 'Assinatura digital' e menciona proposta", () => {
		const text = buildContractSummaryText({
			administradora: "ÂNCORA",
			grupo: "1234",
			creditValue: 80_000,
			monthlyPayment: 900,
			termMonths: 80,
			signatureLink: LINK,
		});
		expect(text).not.toMatch(/assinatura|assinar/i);
		expect(text).toContain(LINK);
		expect(text).toMatch(/proposta/i);
	});
});
