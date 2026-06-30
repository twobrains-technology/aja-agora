// Camada 1 (FIX-109, decisão Kairo 2026-06-28 — spec jornada-entrada-simulador):
//  (a) o valor do bem virou CONVERSA — o WhatsApp não manda mais a lista de
//      faixas (value_picker). Se o artifact ainda chegar, degrada pra pedido
//      conversacional (anti-drop preservado).
//  (b) o simulador no WhatsApp é um LOOP CONVERSACIONAL: a abertura convida o
//      usuário a dizer o mês-alvo; cada iteração apresenta o cenário que o
//      agente calculou (via computeContemplationDial) — aqui só formatamos,
//      nunca recalculamos.

import { describe, expect, it } from "vitest";
import {
	artifactToWhatsApp,
	contemplationDialToWhatsApp,
	valuePickerToWhatsApp,
} from "./formatter";

describe("FIX-109 — value_picker vira conversa (sem lista de faixas)", () => {
	it("valuePickerToWhatsApp não renderiza mais lista interativa de faixas", () => {
		const r = valuePickerToWhatsApp({ category: "auto" });
		expect(r.type).toBe("text");
		// não tem sections/rows de faixas
		expect(r.interactive?.action?.sections).toBeUndefined();
		expect(r.text).toMatch(/valor|quanto custa/i);
	});

	it("usa o rótulo da categoria na conversa (moto → moto, não 'bem' genérico)", () => {
		const r = valuePickerToWhatsApp({ category: "moto" });
		expect(r.text).toMatch(/moto/i);
	});

	it("anti-drop: value_picker continua não-nulo no canal WhatsApp", () => {
		expect(artifactToWhatsApp("value_picker", { category: "moto", fields: [] })).not.toBeNull();
	});
});

describe("FIX-109 — simulador conversacional (abertura + iteração)", () => {
	it("abertura (só inputs do plano): convida o loop, sem marcos estáticos 3/6/12/24", () => {
		const r = contemplationDialToWhatsApp({
			creditValue: 80000,
			termMonths: 80,
			monthlyPayment: 1200,
		});
		expect(r.type).toBe("text");
		const t = r.text ?? "";
		// convida a dizer o mês-alvo
		expect(t).toMatch(/quantos meses|quando.*contemplad/i);
		// NÃO é mais a lista fixa de marcos
		expect(t).not.toMatch(/\b3m:|\b6m:|\b12m:|\b24m:/);
	});

	it("iteração: formata o cenário calculado pelo agente (lance), sem recalcular", () => {
		const r = contemplationDialToWhatsApp({
			administradora: "Porto Seguro",
			creditValue: 80000,
			termMonths: 80,
			// cenário calculado pelo agente (computeContemplationDial) — bloco-jornada
			scenario: {
				targetMonth: 6,
				mode: "lance",
				requiredLancePct: 45,
				requiredLanceValue: 36000,
				receivedCredit: 64000,
				paymentAfterContemplation: 1200,
			},
		});
		expect(r.type).toBe("text");
		const t = r.text ?? "";
		expect(t).toMatch(/6 meses/);
		expect(t).toMatch(/45%/);
		expect(t).toMatch(/64\.000/); // crédito recebido formatado
		expect(t).toMatch(/contemplação não é garantida/i); // ressalva discreta
	});

	it("iteração modo sorteio: lance opcional, parcela menor", () => {
		const r = contemplationDialToWhatsApp({
			creditValue: 80000,
			termMonths: 80,
			scenario: { targetMonth: 60, mode: "sorteio", requiredLancePct: 0 },
		});
		const t = r.text ?? "";
		expect(t).toMatch(/60 meses/);
		expect(t).toMatch(/sorteio/i);
	});

	it("anti-drop: contemplation_dial continua não-nulo (FEAT-CONTEMPLATION-DIAL)", () => {
		expect(
			artifactToWhatsApp("contemplation_dial", {
				creditValue: 50000,
				termMonths: 80,
				monthlyPayment: 600,
			}),
		).not.toBeNull();
	});
});
