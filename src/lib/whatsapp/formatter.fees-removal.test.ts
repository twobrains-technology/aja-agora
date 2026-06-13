import { describe, expect, it } from "vitest";
import {
	groupCardToWhatsApp,
	recommendationToWhatsApp,
	simulationResultToWhatsApp,
} from "./formatter";

// Decisão de produto (Bernardo, 2026-06-11): cards mais diretos, sem taxa de
// administração / fundo de reserva / seguro / custo total / taxa efetiva — assusta
// o leigo. Vale para o WhatsApp também (mesmo conteúdo em texto). A composição
// completa (CMN 4.927/2021 + CDC art. 37) é disclosed no PDF da proposta
// pré-assinatura — ver docs/jornada/CONTEXT.md.

const bodyOf = (r: { interactive?: { body?: { text?: string } } }) =>
	r.interactive?.body?.text ?? "";

describe("WhatsApp — sem composição de custos nas mensagens (Bernardo 2026-06-11)", () => {
	const simulation = {
		groupId: "g1",
		creditValue: 900000,
		monthlyPayment: 5715,
		adminFee: 162000,
		reserveFund: 33750,
		insurance: 45000,
		totalCost: 1140750,
		termMonths: 200,
		effectiveRate: 27,
	};

	const recommendation = {
		id: "g1",
		administradora: "Rodobens",
		category: "imovel",
		creditValue: 900000,
		monthlyPayment: 5715,
		adminFeePercent: 18,
		termMonths: 200,
		contemplationRate: 2,
		score: 0.9,
	};

	const group = {
		id: "g1",
		administradora: "Rodobens",
		category: "imovel",
		creditValue: 900000,
		monthlyPayment: 5715,
		adminFeePercent: 18,
		termMonths: 200,
		contemplationRate: 2,
	};

	it("simulationResultToWhatsApp não menciona taxa admin / fundo reserva / seguro / custo total / taxa efetiva", () => {
		const body = bodyOf(simulationResultToWhatsApp(simulation));
		expect(body).not.toMatch(/taxa admin/i);
		expect(body).not.toMatch(/fundo reserva/i);
		expect(body).not.toMatch(/seguro/i);
		expect(body).not.toMatch(/custo total/i);
		expect(body).not.toMatch(/taxa efetiva/i);
		// o essencial continua
		expect(body).toMatch(/valor do bem/i);
		expect(body).toMatch(/parcela/i);
		expect(body).toMatch(/200 meses/i);
	});

	it("recommendationToWhatsApp não menciona % admin", () => {
		const body = bodyOf(recommendationToWhatsApp(recommendation));
		expect(body).not.toMatch(/admin/i);
		expect(body).toMatch(/200 meses/i);
	});

	it("groupCardToWhatsApp não menciona taxa admin", () => {
		const body = bodyOf(groupCardToWhatsApp(group));
		expect(body).not.toMatch(/taxa admin/i);
		expect(body).toMatch(/valor do bem/i);
		expect(body).toMatch(/200 meses/i);
	});
});
