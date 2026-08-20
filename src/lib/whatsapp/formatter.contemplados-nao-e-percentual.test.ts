/**
 * ACHADO FORA DO PRD, mesma família do D4 — O WHATSAPP MOSTRAVA A CONTAGEM
 * COMO PORCENTAGEM.
 *
 * `contemplationRate` é, na origem, `monthlyAwardedQuotas`: a CONTAGEM de cotas
 * contempladas por mês (offer-mapper.ts copia o mesmo valor para
 * `availableSlots` e para `contemplationRate` — são o mesmo número). A web
 * consertou isso no FIX-231 e passou a exibir "N por mês"; o formatter do
 * WhatsApp ficou para trás e seguia imprimindo:
 *
 *   "Contemplação: 15.0%/assembleia"
 *
 * O cliente do WhatsApp lia 15% de chance por assembleia onde o dado real é
 * "15 cotas contempladas por mês". Número errado na cara do cliente — a linha
 * que este projeto trata como invariante, não como estilo.
 */

import { describe, expect, it } from "vitest";
import { groupCardToWhatsApp, recommendationToWhatsApp } from "./formatter";

const grupo = {
	id: "bb-217",
	administradora: "BANCO DO BRASIL",
	category: "imovel",
	creditValue: 499_634,
	monthlyPayment: 3_031,
	adminFeePercent: 18,
	termMonths: 217,
	availableSlots: 15,
};

const corpoDe = (fn: (p: Record<string, unknown>) => unknown, payload: Record<string, unknown>) =>
	JSON.stringify(fn(payload));

describe("contemplados por mês no WhatsApp é contagem, não porcentagem", () => {
	it("group_card fala em cotas contempladas por mês", () => {
		const corpo = corpoDe(groupCardToWhatsApp, grupo);
		expect(corpo).toContain("15 contemplados/mês");
		expect(corpo).not.toContain("%/assembleia");
	});

	it("recommendation_card idem", () => {
		const corpo = corpoDe(recommendationToWhatsApp, {
			...grupo,
			score: 0.9,
			scoreBreakdown: { monthlyFit: 1, contemplation: 1, adminFee: 1, termMatch: 1 },
		});
		expect(corpo).toContain("15 contemplados/mês");
		expect(corpo).not.toContain("% contemplação");
	});

	it("sem o dado real, nenhuma linha de contemplação — nunca 0", () => {
		const corpo = corpoDe(groupCardToWhatsApp, { ...grupo, availableSlots: 0 });
		expect(corpo).not.toContain("contemplados/mês");
		expect(corpo).not.toContain("Contemplação");
	});
});
