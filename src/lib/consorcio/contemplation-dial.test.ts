import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	anchorMonth,
	computeContemplationDial,
	contemplationDialMarks,
	paymentAfterLabel,
} from "./contemplation-dial";

// FIX-245 (rodada 2, Fable r1, §D4.e + gap #10): o comentário do campo
// paymentAfterContemplation (FIX-C4) dizia "só o lance em DINHEIRO abate o
// saldo" — stale desde o FIX-221 (AMORTIZA), que abate o saldo com o lance
// TOTAL (dinheiro + embutido). Trava a paridade comentário×código.
describe("FIX-245 — comentário de paymentAfterContemplation bate com o código (AMORTIZA)", () => {
	const src = readFileSync(new URL("./contemplation-dial.ts", import.meta.url), "utf8");

	it("NÃO diz mais que 'só o lance em dinheiro' abate o saldo (stale, pré-FIX-221)", () => {
		// [\s*]+ tolera a quebra de linha do JSDoc ("...DINHEIRO\n\t * abate...").
		expect(src).not.toMatch(/s[óo]\s+o\s+lance\s+em\s+dinheiro[\s*]+abate/i);
	});

	it("documenta que o lance TOTAL (dinheiro + embutido) amortiza, igual ao código (FIX-221)", () => {
		const docBlock = src.slice(
			src.indexOf("paymentAfterContemplation?:") - 400,
			src.indexOf("paymentAfterContemplation?:"),
		);
		expect(docBlock).toMatch(/FIX-221/);
		expect(docBlock.toLowerCase()).toMatch(/dinheiro \+ embutido|total/);
	});
});

const base = {
	creditValue: 100_000,
	termMonths: 80,
	historicalWinningBidPct: 40,
	monthlyPayment: 1500,
};

describe("computeContemplationDial — trade-off tempo↔lance↔crédito", () => {
	it("mais cedo exige MAIS lance que mais tarde (monotônico)", () => {
		const m3 = computeContemplationDial({ ...base, targetMonth: 3 });
		const m12 = computeContemplationDial({ ...base, targetMonth: 12 });
		const m48 = computeContemplationDial({ ...base, targetMonth: 48 });
		expect(m3.requiredLancePct).toBeGreaterThan(m12.requiredLancePct);
		expect(m12.requiredLancePct).toBeGreaterThan(m48.requiredLancePct);
	});

	it("lance embutido limitado ao teto; excedente vira lance próprio (cash)", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 3, maxEmbutidoPct: 30 });
		expect(r.embeddedBidPct).toBeLessThanOrEqual(30);
		if (r.requiredLancePct > 30) {
			expect(r.ownCashPct).toBe(r.requiredLancePct - r.embeddedBidPct);
			expect(r.ownCashValue).toBeGreaterThan(0);
		}
	});

	it("crédito líquido = carta − lance embutido (em R$)", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 6 });
		expect(r.receivedCredit).toBe(100_000 - r.embeddedBidValue);
		expect(r.receivedCredit).toBeLessThanOrEqual(100_000);
	});

	it("lance (dinheiro + embutido) abate o saldo → parcela pós-contemplação menor que a base (FIX-221 AMORTIZA)", () => {
		// Modelo antigo (parcela × (1 − lance%)) era fantasia: contava o EMBUTIDO
		// como abatimento e aplicava o desconto desde o mês 1. Auditoria 2026-06-11.
		// FIX-221 (Ata 2026-07-04): o modelo agora É que o lance TOTAL (embutido +
		// dinheiro) amortiza o saldo pós-contemplação — inverte C4/D18 antigos.
		const r = computeContemplationDial({ ...base, targetMonth: 6 });
		// targetMonth 6 num grupo de 80 meses exige lance > teto de embutido →
		// tem parte em dinheiro, que abate o saldo restante.
		expect(r.ownCashValue).toBeGreaterThan(0);
		expect(r.paymentAfterContemplation).toBeLessThan(1500);
		// e a diluição é o lance TOTAL (embutido + bolso) espalhado nos meses restantes
		const expected = (1500 * (80 - 6) - r.ownCashValue - r.embeddedBidValue) / (80 - 6);
		expect(r.paymentAfterContemplation).toBeCloseTo(expected, 1);
	});

	it("FIX-225: teto de 90% no lance pra metas muito agressivas (curva power, clamp novo)", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 1, historicalWinningBidPct: 60 });
		expect(r.requiredLancePct).toBeLessThanOrEqual(90);
	});

	it("'sem pressa' (mês tardio) → modo sorteio, lance opcional/baixo", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 76 });
		expect(r.mode).toBe("sorteio");
		expect(r.requiredLancePct).toBeLessThanOrEqual(10);
	});

	it("FIX-225: likelihood foi removido do output (heurística sem base de dado)", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 24 });
		expect("likelihood" in r).toBe(false);
	});

	it("clampa targetMonth fora do prazo do grupo", () => {
		const r = computeContemplationDial({ ...base, targetMonth: 999 });
		expect(r.targetMonth).toBe(80);
	});

	it("sem sinal histórico usa default sem quebrar", () => {
		const r = computeContemplationDial({ creditValue: 50_000, termMonths: 60, targetMonth: 12 });
		expect(r.requiredLancePct).toBeGreaterThanOrEqual(0);
		expect(r.requiredLanceValue).toBeGreaterThanOrEqual(0);
	});
});

// FIX-225 (spec docs/03-regras-calculo.md): a curva hiperbólica antiga achatava em
// 90% (clamp) nos meses iniciais e nunca convergia a zero no fim do prazo (sorteio
// não emergia sozinho). A curva power calibrada corrige isso: passa exatamente pelo
// ponto real (referenceMonth, winningBidPct) e tende a zero no fim do prazo.
describe("FIX-225 — curva power calibrada (calibração + convergência + winningBidPct por oferta)", () => {
	it("curve(referenceMonth) === winningBidPct (calibração exata, ±0.5%)", () => {
		const r = computeContemplationDial({
			creditValue: 171_000,
			termMonths: 96,
			targetMonth: 20,
			averageBid: 89_946, // 89_946 / 171_000 = 52,6%
			referenceMonth: 20,
		});
		expect(r.requiredLancePct).toBeCloseTo(52.6, 0);
	});

	it("curve(termMonths) < 8% — modo sorteio emerge sozinho no fim do prazo", () => {
		const r = computeContemplationDial({
			creditValue: 171_000,
			termMonths: 96,
			targetMonth: 96,
			averageBid: 89_946,
			referenceMonth: 20,
		});
		expect(r.requiredLancePct).toBeLessThan(8);
		expect(r.mode).toBe("sorteio");
	});

	it("curve(m) monotônica decrescente em [1, termMonths]", () => {
		const input = { creditValue: 171_000, termMonths: 96, averageBid: 89_946, referenceMonth: 20 };
		const months = [1, 3, 6, 12, 20, 40, 60, 80, 96];
		const pcts = months.map(
			(m) => computeContemplationDial({ ...input, targetMonth: m }).requiredLancePct,
		);
		for (let i = 1; i < pcts.length; i++) {
			expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1]);
		}
	});

	it("curve(1) < 90% — não bate no clamp na região útil (achatamento corrigido)", () => {
		const r = computeContemplationDial({
			creditValue: 171_000,
			termMonths: 96,
			targetMonth: 1,
			averageBid: 89_946,
			referenceMonth: 20,
		});
		expect(r.requiredLancePct).toBeLessThan(90);
	});

	it("cartas diferentes → winningBidPct diferentes (derivado POR OFERTA, nunca % fixo)", () => {
		const cartaA = computeContemplationDial({
			creditValue: 171_000,
			termMonths: 96,
			targetMonth: 20,
			averageBid: 89_946, // 52,6%
			referenceMonth: 20,
		});
		const cartaB = computeContemplationDial({
			creditValue: 123_000,
			termMonths: 96,
			targetMonth: 20,
			averageBid: 102_090, // 83% — mesma referenceMonth, oferta bem mais cara
			referenceMonth: 20,
		});
		// No mês de referência, cada carta reflete o SEU próprio winningBidPct —
		// nunca o lance de uma carta reaproveitado em outra.
		expect(cartaA.requiredLancePct).toBeCloseTo(52.6, 0);
		expect(cartaB.requiredLancePct).toBeCloseTo(83, 0);
		expect(cartaA.requiredLancePct).not.toBe(cartaB.requiredLancePct);
	});

	it("paymentAfterContemplation nunca excede a parcela base", () => {
		const r = computeContemplationDial({
			creditValue: 171_000,
			termMonths: 96,
			targetMonth: 12,
			averageBid: 89_946,
			referenceMonth: 20,
			monthlyPayment: 2_500,
		});
		expect(r.paymentAfterContemplation).toBeLessThanOrEqual(2_500);
	});

	it("nenhuma saída expõe redução de prazo (D7 — fora de escopo)", () => {
		const r = computeContemplationDial({
			creditValue: 171_000,
			termMonths: 96,
			targetMonth: 20,
			averageBid: 89_946,
			referenceMonth: 20,
		});
		expect("reducedTermMonths" in r).toBe(false);
		expect("newTermMonths" in r).toBe(false);
	});

	it("admSobreEmbutido: presente quando admFeePct informado, undefined no Trilho A (ausente)", () => {
		const comAdm = computeContemplationDial({
			creditValue: 171_000,
			termMonths: 96,
			targetMonth: 20,
			averageBid: 89_946,
			referenceMonth: 20,
			admFeePct: 18,
		});
		const semAdm = computeContemplationDial({
			creditValue: 171_000,
			termMonths: 96,
			targetMonth: 20,
			averageBid: 89_946,
			referenceMonth: 20,
		});
		expect(comAdm.admSobreEmbutido).toBeCloseTo(comAdm.embeddedBidValue * 0.18, 2);
		expect(semAdm.admSobreEmbutido).toBeUndefined();
	});
});

describe("contemplationDialMarks — fallback estático (WhatsApp)", () => {
	it("gera marcos só dentro do prazo, em ordem decrescente de lance", () => {
		const marks = contemplationDialMarks(base, [3, 6, 12, 24]);
		expect(marks.length).toBe(4);
		expect(marks[0].targetMonth).toBe(3);
		// 3 meses exige mais lance que 24
		expect(marks[0].requiredLancePct).toBeGreaterThan(marks[3].requiredLancePct);
	});

	it("descarta marcos além do prazo do grupo", () => {
		const marks = contemplationDialMarks({ ...base, termMonths: 10 }, [3, 6, 12, 24]);
		expect(marks.every((m) => m.targetMonth <= 10)).toBe(true);
	});
});

// BUG-DIAL-NAN (auditoria adversarial Opus 2026-06-28): input fora de contrato
// (creditValue/termMonths/targetMonth NaN, ex.: Math.max(0, NaN) === NaN a montante)
// vazava NaN em requiredLanceValue/embeddedBidValue → "R$ NaN" na tela. Sanitiza na
// fronteira: NaN/não-finito vira o degenerado seguro, NUNCA propaga NaN.
describe("computeContemplationDial — blindagem contra NaN (input fora de contrato)", () => {
	it("creditValue NaN → nenhum campo numérico vira NaN", () => {
		const r = computeContemplationDial({
			creditValue: Number.NaN,
			termMonths: 80,
			targetMonth: 12,
		});
		for (const [k, v] of Object.entries(r)) {
			if (typeof v === "number") expect(Number.isNaN(v), `campo ${k}`).toBe(false);
		}
	});

	it("TODOS os campos numéricos NaN → degrada sem vazar NaN", () => {
		const r = computeContemplationDial({
			creditValue: Number.NaN,
			termMonths: Number.NaN,
			targetMonth: Number.NaN,
			historicalWinningBidPct: Number.NaN,
			referenceMonth: Number.NaN,
			monthlyPayment: Number.NaN,
			maxEmbutidoPct: Number.NaN,
		});
		for (const [k, v] of Object.entries(r)) {
			if (typeof v === "number") expect(Number.isNaN(v), `campo ${k}`).toBe(false);
		}
	});
});

// BUG-LANCE-ACIMA-DO-MEDIO (sessão 2026-07-21, oferta Itaú real): o cliente pediu
// contemplação em 5 meses e o agente afirmou "lance de R$ 190.132,20 (90% da carta)"
// — R$ 25 mil ACIMA do lance médio de R$ 164.591,11 que o próprio card exibia. O 90%
// não era cálculo: era o clamp MAX_LANCE_PCT batendo (a curva pedia 103%). Dois
// defeitos no mesmo invariante — "nunca afirmar número que a administradora não
// sustenta" (CLAUDE.md: número vem de tool, nunca da cabeça do modelo):
//   1. lance afirmado ACIMA do único dado real (averageBid) — pura extrapolação;
//   2. no PRÓPRIO mês de referência o dial dava R$ 164.781,24 contra R$ 164.591,11
//      do card (o pct arredondado a inteiro re-derivava o valor) — duas fontes de
//      verdade pro mesmo número, exatamente o que o comentário do FIX-C1 promete
//      que não acontece.
describe("BUG-LANCE-ACIMA-DO-MEDIO — lance médio da oferta é TETO do que se afirma", () => {
	// Oferta real da sessão: Itaú, automóvel, carta R$ 211.258, 48 meses.
	// Sem referenceMonth (a Bevi não manda — Pendência P5), âncora heurística = 12.
	const itau = {
		creditValue: 211_258,
		termMonths: 48,
		averageBid: 164_591.11, // 77,91% da carta
		monthlyPayment: 5_377.25,
	};

	it("mês agressivo NÃO devolve lance acima do lance médio real da oferta", () => {
		const r = computeContemplationDial({ ...itau, targetMonth: 5 });
		expect(r.requiredLanceValue).toBeLessThanOrEqual(164_591.11);
	});

	it("a composição continua fechando: embutido + bolso === lance total", () => {
		const r = computeContemplationDial({ ...itau, targetMonth: 5 });
		expect(r.embeddedBidValue + r.ownCashValue).toBeCloseTo(r.requiredLanceValue, 2);
	});

	it("sinaliza beyondEvidence e o mês mais cedo que o histórico sustenta", () => {
		const r = computeContemplationDial({ ...itau, targetMonth: 5 });
		expect(r.beyondEvidence).toBe(true);
		expect(r.earliestSupportedMonth).toBe(12);
	});

	it("mês dentro do que o histórico sustenta NÃO é marcado como beyondEvidence", () => {
		const r = computeContemplationDial({ ...itau, targetMonth: 24 });
		expect(r.beyondEvidence).toBe(false);
		expect(r.requiredLanceValue).toBeLessThan(164_591.11);
	});

	it("no mês de referência o dial bate CENTAVO A CENTAVO com o lance médio do card", () => {
		const r = computeContemplationDial({ ...itau, targetMonth: 12 });
		expect(r.requiredLanceValue).toBe(164_591.11);
	});

	it("sem averageBid (Trilho A, sem dado real) não há teto de evidência a aplicar", () => {
		// Sem número da administradora não existe "acima do observado" — o
		// comportamento legado (teto de 90%) permanece, e nada é marcado como
		// beyondEvidence (não há evidência pra extrapolar).
		const r = computeContemplationDial({
			creditValue: 100_000,
			termMonths: 80,
			historicalWinningBidPct: 40,
			targetMonth: 1,
		});
		expect(r.beyondEvidence).toBe(false);
		expect(r.requiredLancePct).toBeGreaterThan(40);
	});

	it("monotonicidade preservada com o teto (nunca sobe conforme o mês avança)", () => {
		const pcts = [1, 3, 5, 8, 12, 24, 36, 48].map(
			(m) => computeContemplationDial({ ...itau, targetMonth: m }).requiredLanceValue,
		);
		for (let i = 1; i < pcts.length; i++) expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1]);
	});
});

// FIX-221 (Ata 2026-07-04, inbox 2026-07-02-dial-parcela-apos-lance-identica):
// bug real — com lance 100% embutido, a parcela "depois" saía IDÊNTICA à de
// antes mas rotulada "menor, depois do lance" (contradição visível). O rótulo
// NUNCA pode mentir — só diz "menor" quando o número de fato caiu.
describe("paymentAfterLabel — rótulo nunca mente (FIX-221)", () => {
	it("parcela depois MENOR → 'menor, depois do lance'", () => {
		expect(paymentAfterLabel(800, 6_800)).toBe("menor, depois do lance");
	});

	it("parcela depois IGUAL (sem lance a abater) → rótulo neutro, NUNCA 'menor'", () => {
		expect(paymentAfterLabel(6_800, 6_800)).not.toMatch(/menor/i);
	});

	it("sem estimativa (undefined, ex.: contemplação no último mês) → rótulo neutro", () => {
		expect(paymentAfterLabel(undefined, 6_800)).not.toMatch(/menor/i);
	});
});

// FIX-227: a agulha responde "quando o seu DINHEIRO alcança o lance", não
// "quando você quer". A comparação é contra o BOLSO (ownCashValue), nunca
// contra o lance total — o embutido não sai do bolso do cliente. FGTS
// (vertical imóvel) acelera: abate o bolso necessário antes da comparação.
describe("anchorMonth — mês em que o dinheiro do cliente alcança o lance (FIX-227)", () => {
	const imovel = {
		creditValue: 300_000,
		termMonths: 180,
		averageBid: 150_000, // 50%
		referenceMonth: 60,
		maxEmbutidoPct: 30,
	};

	it("compara contra ownCashValue (bolso), não requiredLanceValue (lance total)", () => {
		// bolso no mês-alvo escolhido é sempre <= lance total (parte vai de embutido).
		const dial = computeContemplationDial({ ...imovel, targetMonth: 60 });
		expect(dial.ownCashValue).toBeLessThan(dial.requiredLanceValue);
		// com dinheiro exatamente igual ao bolso do mês 60 (não ao lance total),
		// a âncora deve resolver pra um mês <= 60 (o bolso é alcançável antes).
		const m = anchorMonth(imovel, { initial: dial.ownCashValue, monthlySavings: 0 });
		expect(m).not.toBeNull();
		expect(m as number).toBeLessThanOrEqual(60);
	});

	it("initial cobre o bolso do mês 1 → retorna 1", () => {
		const dial1 = computeContemplationDial({ ...imovel, targetMonth: 1 });
		const m = anchorMonth(imovel, { initial: dial1.ownCashValue + 1, monthlySavings: 0 });
		expect(m).toBe(1);
	});

	it("monthlySavings=0 e initial insuficiente em todo o prazo → retorna null (orienta sorteio)", () => {
		// Grupo de 1 mês só (sem "esperar até o sorteio" pra diluir o bolso a
		// zero — a curva SEMPRE converge a 0 no último mês do prazo, então um
		// prazo mais longo sempre acha âncora no fim; aqui não há "fim" pra
		// esperar) e sem embutido (bolso = lance inteiro, nunca cai a zero).
		const semSaida = {
			creditValue: 300_000,
			termMonths: 1,
			averageBid: 150_000,
			referenceMonth: 1,
			maxEmbutidoPct: 0,
		};
		const m = anchorMonth(semSaida, { initial: 0, monthlySavings: 0 });
		expect(m).toBeNull();
	});

	it("FGTS (vertical imóvel) acelera — mês alcançado com FGTS é MENOR (ou igual) que sem FGTS", () => {
		const money = { initial: 5_000, monthlySavings: 3_000 };
		const semFgts = anchorMonth(imovel, money);
		const comFgts = anchorMonth(imovel, { ...money, fgts: 40_000 });
		expect(semFgts).not.toBeNull();
		expect(comFgts).not.toBeNull();
		expect(comFgts as number).toBeLessThanOrEqual(semFgts as number);
	});

	it("monotonicidade: mais poupança/mês → mês alcançado nunca aumenta", () => {
		const pouco = anchorMonth(imovel, { initial: 1_000, monthlySavings: 1_000 });
		const muito = anchorMonth(imovel, { initial: 1_000, monthlySavings: 5_000 });
		expect(pouco).not.toBeNull();
		expect(muito).not.toBeNull();
		expect(muito as number).toBeLessThanOrEqual(pouco as number);
	});
});
