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

const corpoDoDial = (wa: { interactive?: unknown }) =>
	semNbsp((wa.interactive as { body: { text: string } }).body.text);

describe("o dial do WhatsApp diz o resultado, não só a pergunta", () => {
	it("o payload da carta vira CENÁRIO calculado, como o componente web faz no cliente", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp({ ...PLANO, initialTargetMonth: 12 });
		expect(wa.type).toBe("interactive");
		const corpo = corpoDoDial(wa);
		// O resultado do mês-alvo do payload — não a pergunta solta.
		expect(corpo).toContain("12 meses");
		expect(corpo).toContain("R$ 12.000");
		expect(corpo).toContain("R$ 68.000");
		// O de-para da parcela (a referência é a parcela do próprio payload).
		expect(corpo).toContain("R$ 700");
		expect(corpo).toContain("R$ 589");
		// E o loop continua aberto: no chat não há slider pra pedir outro prazo.
		expect(corpo).toMatch(/quantos meses/i);
	});

	it('o mês-alvo muda o número — "Testar outro prazo" não repete o anterior', async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const cedo = corpoDoDial(contemplationDialToWhatsApp({ ...PLANO, initialTargetMonth: 12 }));
		const tarde = corpoDoDial(contemplationDialToWhatsApp({ ...PLANO, initialTargetMonth: 60 }));
		expect(cedo).toContain("12 meses");
		expect(tarde).toContain("60 meses");
		expect(cedo).not.toBe(tarde);
	});

	it("cenário calculado pelo agente: o de-para da parcela continua saindo", async () => {
		const { contemplationDialToWhatsApp } = await import("./formatter");
		const wa = contemplationDialToWhatsApp({
			...PLANO,
			initialTargetMonth: 60,
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
		const corpo = corpoDoDial(wa);
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
