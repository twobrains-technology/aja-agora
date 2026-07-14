import { describe, expect, it } from "vitest";
import { formatTextForWhatsApp, scrubCpf } from "./formatter";

/**
 * FIX-337 (bloco-c-whatsapp-invariantes, invariante I6) — dossiê auto-whatsapp
 * turno 10: o agente ecoou o CPF do cliente com os 11 dígitos EM CLARO no
 * balão ("Perfeito, anotei seu CPF: 529.982.247-25..."). `formatTextForWhatsApp`
 * não tinha nenhum scrub de PII — a máscara (`maskCpf`) só era aplicada no
 * card determinístico de contrato, nunca no texto livre do modelo.
 *
 * CPF de teste: 529.982.247-25 (mesmo CPF válido usado em identity.test.ts —
 * dígito verificador real, módulo 11).
 */
describe("formatTextForWhatsApp — nunca deixa CPF em claro (I6)", () => {
	it("CPF sem pontuação é mascarado", () => {
		expect(formatTextForWhatsApp("seu CPF 52998224725")).toBe("seu CPF ***.***.247-25");
	});

	it("CPF com pontuação é mascarado", () => {
		expect(formatTextForWhatsApp("seu CPF 529.982.247-25")).toBe("seu CPF ***.***.247-25");
	});

	it("dossiê auto-whatsapp real: 'Perfeito, anotei seu CPF: ...' nunca vaza o dígito", () => {
		const out = formatTextForWhatsApp(
			"Perfeito, anotei seu CPF: 529.982.247-25. E qual é o número de celular?",
		);
		expect(out).not.toContain("529.982.247-25");
		expect(out).not.toContain("52998224725");
		expect(out).toContain("***.***.247-25");
	});

	it("CPF partido em duas linhas (quebra de parágrafo) também é mascarado", () => {
		const out = formatTextForWhatsApp("Seu CPF é 529.982.247-\n25, certo?");
		expect(out).not.toContain("529.982.247-\n25");
		expect(out.replace(/\n/g, "")).not.toMatch(/52998224725/);
	});

	it("número de 11 dígitos que NÃO é CPF válido (dígito verificador falha) não é mascarado", () => {
		// "12345678901" falha o dígito verificador (2º DV: esperado 9, calculado 1) —
		// não é CPF real, não pode ser mascarado como se fosse.
		expect(formatTextForWhatsApp("pedido nº 12345678901")).toBe("pedido nº 12345678901");
	});

	it("valor monetário e outros números curtos não são afetados (zero falso-positivo)", () => {
		expect(formatTextForWhatsApp("crédito de R$ 80.000,00 em 50 meses")).toBe(
			"crédito de R$ 80.000,00 em 50 meses",
		);
	});

	it("texto sem CPF passa incólume", () => {
		const t = "Show, vamos seguir com a simulação.";
		expect(formatTextForWhatsApp(t)).toBe(t);
	});
});

describe("scrubCpf — função exportada, usada também como defesa em profundidade", () => {
	it("mascara CPF válido isolado", () => {
		expect(scrubCpf("52998224725")).toBe("***.***.247-25");
	});

	it("preserva texto sem CPF", () => {
		expect(scrubCpf("nada de sensível aqui")).toBe("nada de sensível aqui");
	});
});
