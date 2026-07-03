import { describe, expect, it } from "vitest";
import { formatTextForWhatsApp } from "./formatter";

/**
 * Bug de QA (2026-07-03, rodada qa-dono-produto): valores monetários saem
 * QUEBRADOS no WhatsApp — "R$ 100.000,00" vira "R$ 100.\n\n000,00" (dois balões /
 * duas linhas), cortando o número no ponto de milhar. Reproduzível: "Boa, R$ 100.
 * 000,00 então." e "um lance de R$ 57.\n\n008,00".
 *
 * Causa: o FIX-212 pôs no system-prompt "No WhatsApp, prefira 1-2 frases por
 * mensagem" — o LLM lê o ponto de milhar (R$ 100.000) como fim de frase e insere
 * quebra de parágrafo no meio do número. Fix determinístico (Lei 4): um ponto (ou
 * vírgula) ENTRE DÍGITOS é separador de milhar/decimal, nunca fim de frase — reune
 * o número no formatTextForWhatsApp, independente do que o LLM faça.
 */
describe("formatTextForWhatsApp — não quebra valor monetário no separador de milhar", () => {
	it("R$ 100.<quebra>000,00 → junta em R$ 100.000,00", () => {
		expect(formatTextForWhatsApp("Boa, R$ 100.\n\n000,00 então.")).toBe(
			"Boa, R$ 100.000,00 então.",
		);
	});

	it("lance R$ 57.<quebra>008,00 → junta", () => {
		expect(formatTextForWhatsApp("um lance de R$ 57.\n\n008,00 (71,26%)")).toBe(
			"um lance de R$ 57.008,00 (71,26%)",
		);
	});

	it("quebra por vírgula decimal também é reunida (R$ 954,\\n19)", () => {
		expect(formatTextForWhatsApp("parcela de R$ 954,\n19 por mês")).toBe(
			"parcela de R$ 954,19 por mês",
		);
	});

	it("quebra de parágrafo LEGÍTIMA (entre frases) é preservada", () => {
		const t = "Primeira frase.\n\nSegunda frase começa aqui.";
		expect(formatTextForWhatsApp(t)).toBe(t);
	});

	it("número inteiro sem quebra não é afetado", () => {
		expect(formatTextForWhatsApp("crédito de R$ 80.000,00 total")).toBe(
			"crédito de R$ 80.000,00 total",
		);
	});
});
