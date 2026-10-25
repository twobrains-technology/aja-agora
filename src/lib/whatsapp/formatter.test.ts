import { describe, expect, it, vi } from "vitest";

// `toLocaleString("pt-BR", { style: "currency" })` separa com espaço INQUEBRÁVEL.
const semNbsp = (t: string) => t.replace(/\u00a0/g, " ");

vi.mock("@/db", () => ({ db: {} }));

const PLANO = {
	groupId: "grp-canopus-1",
	administradora: "Canopus",
	creditValue: 80000,
	monthlyPayment: 700,
	termMonths: 120,
	initialTargetMonth: 60,
	avgBidValue: 12000,
};

describe("o dial do WhatsApp diz o resultado, não só a pergunta", () => {
	it("abertura (só inputs do plano): carta, prazo, parcela e lance médio em texto", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp(PLANO);
		expect(wa.type).toBe("text");
		const texto = semNbsp(wa.text ?? "");
		expect(texto).toContain("R$ 80.000");
		expect(texto).toContain("120 meses");
		expect(texto).toContain("R$ 700");
		expect(texto).toContain("R$ 12.000");
		// E o convite ao loop continua, porque no chat não há slider.
		expect(texto).toMatch(/quantos meses/i);
	});

	it("cenário calculado pelo agente: o de-para da parcela continua saindo", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp({
			...PLANO,
			scenario: {
				targetMonth: 60,
				mode: "lance",
				requiredLancePct: 25,
				requiredLanceValue: 20000,
				receivedCredit: 80000,
				paymentBeforeContemplation: 700,
				paymentAfterContemplation: 420,
			},
		});
		expect(wa.type).toBe("interactive");
		const corpo = semNbsp((wa.interactive as { body: { text: string } }).body.text);
		expect(corpo).toContain("R$ 700");
		expect(corpo).toContain("R$ 420");
		expect(corpo).toContain("60 meses");
	});

	it("payload vazio não inventa número — só a pergunta", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp({});
		expect(wa.text ?? "").not.toMatch(/R\$/);
		expect(wa.text ?? "").toMatch(/quantos meses/i);
	});
});
