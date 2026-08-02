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

/** O `brlWa` (Intl) separa "R$" do número com espaço não-quebrável; normalizar
 * deixa a asserção legível em vez de virar regex ilegível. */
const semNbsp = (t: string | undefined) => (t ?? "").replace(/\u00a0/g, " ");

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
		// FIX-426: o balão passou a sair COM ação. Num chat sem slider, fechar o
		// turno com três números e ponto final deixava a pessoa sem saber o que
		// responder — e ela parava ali.
		expect(r.type).toBe("interactive");
		const t = r.text ?? "";
		expect(t).toMatch(/6 meses/);
		expect(t).toMatch(/45%/);
		expect(t).toMatch(/64\.000/); // crédito recebido formatado
		expect(t).toMatch(/contemplação não é garantida/i); // ressalva discreta
		const botoes = (r.interactive?.action?.buttons ?? []).map((b) => b.reply.id);
		expect(botoes, "os dois IDs precisam ter handler em interactive-handlers").toEqual([
			"simoffer_yes",
			"decision_contratar",
		]);
	});

	// FIX-426 (Kairo, WhatsApp 2026-07-30) — a parcela pós-contemplação vinha
	// sozinha, sem o valor de antes, que é justamente o número que dá sentido à
	// queda. Quando o payload traz a parcela atual, o balão mostra o de-para.
	it("iteração: mostra a parcela caindo de X pra Y quando o plano vem no payload", () => {
		const r = contemplationDialToWhatsApp({
			creditValue: 200000,
			termMonths: 116,
			monthlyPayment: 2405,
			scenario: {
				targetMonth: 6,
				mode: "lance",
				requiredLancePct: 30,
				requiredLanceValue: 60000,
				receivedCredit: 140000,
				paymentAfterContemplation: 1980,
			},
		});
		// `brlWa` usa Intl, que separa "R$" do número com espaço NÃO-QUEBRÁVEL
		// (U+00A0) — comparar com espaço comum falha sem motivo aparente.
		expect(semNbsp(r.text)).toContain("a parcela cai de R$ 2.405 pra ~*R$ 1.980*/mês");
	});

	it("iteração: sem a parcela atual, degrada pro valor sozinho — não inventa comparação", () => {
		const r = contemplationDialToWhatsApp({
			scenario: {
				targetMonth: 12,
				mode: "lance",
				requiredLancePct: 18,
				requiredLanceValue: 36000,
				receivedCredit: 164000,
				paymentAfterContemplation: 2100,
			},
		});
		expect(r.text).not.toContain("cai de");
		expect(semNbsp(r.text)).toContain("a parcela fica em ~*R$ 2.100*/mês");
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
