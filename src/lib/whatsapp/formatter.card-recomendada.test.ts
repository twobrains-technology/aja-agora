// Camada 1 (FIX-108, decisão Kairo 2026-06-28 — spec jornada-entrada-simulador):
// no WhatsApp a escolha do grupo NÃO é mais lista plana. A recomendada vem em
// DESTAQUE (card com CTAs de ação) + botão "Ver outras opções" que abre as
// alternativas (a comparação). Preserva o anti-drop e os CTAs como botão.

import { describe, expect, it } from "vitest";
import { comparisonTableToWhatsApp, recommendationToWhatsApp } from "./formatter";

const rec = {
	id: "g1",
	administradora: "Porto Seguro",
	category: "auto",
	creditValue: 80000,
	monthlyPayment: 1200,
	termMonths: 80,
	contemplationRate: 2,
	score: 0.92,
};

const buttonsOf = (r: {
	interactive?: { action?: { buttons?: Array<{ reply: { id: string; title?: string } }> } };
}) => r.interactive?.action?.buttons ?? [];

describe("FIX-108 — card da recomendada + 'Ver outras opções' (WhatsApp)", () => {
	it("recommendationToWhatsApp inclui botão 'Ver outras opções' (id show_others)", () => {
		const buttons = buttonsOf(recommendationToWhatsApp(rec));
		const ids = buttons.map((b) => b.reply.id);
		const titles = buttons.map((b) => b.reply.title ?? "");
		expect(ids).toContain("show_others");
		expect(titles.some((t) => /ver outras op/i.test(t))).toBe(true);
	});

	it("preserva os CTAs de ação (Tenho interesse + Simular) como botão", () => {
		const buttons = buttonsOf(recommendationToWhatsApp(rec));
		const ids = buttons.map((b) => b.reply.id);
		expect(ids).toContain(`interest_${rec.id}`);
		expect(ids).toContain(`simulate_${rec.id}`);
	});

	it("respeita o limite de 3 botões e títulos ≤ 20 chars (Meta)", () => {
		const buttons = buttonsOf(recommendationToWhatsApp(rec));
		expect(buttons.length).toBeLessThanOrEqual(3);
		for (const b of buttons) expect((b.reply.title ?? "").length).toBeLessThanOrEqual(20);
	});

	it("comparison_table segue mapeada (alvo do 'Ver outras opções') — anti-drop", () => {
		const r = comparisonTableToWhatsApp({
			groups: [
				{
					id: "g1",
					administradora: "Porto",
					creditValue: 80000,
					monthlyPayment: 1200,
					termMonths: 80,
				},
				{
					id: "g2",
					administradora: "Itaú",
					creditValue: 82000,
					monthlyPayment: 1250,
					termMonths: 84,
				},
			],
		});
		expect(r).not.toBeNull();
		expect(r.interactive?.action?.sections?.[0]?.rows?.length).toBeGreaterThanOrEqual(2);
	});
});
