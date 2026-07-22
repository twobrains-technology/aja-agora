// Camada 1 — FIX-16: inteligência do ValuePicker (present_value_picker).
// Pedido do Kairo (2026-06-11): "conforme o usuário arrasta a parcela mensal e
// qtd de meses, o valor do bem sobe" — sliders interligados pela relação de
// consórcio do plan-estimate (parcela ≈ bem × (1+taxa típica) / prazo).

import { describe, expect, it } from "vitest";
import type { ValuePickerField } from "@/lib/chat/types";
import { TYPICAL_ADMIN_FEE_PCT, TYPICAL_TERM_MONTHS } from "./plan-estimate";
import { identifyLinkRoles, recalcLinkedValues } from "./value-picker-link";

const field = (partial: Partial<ValuePickerField> & { id: string }): ValuePickerField => ({
	label: partial.id,
	min: 0,
	max: 1_000_000,
	step: 1,
	default: 0,
	format: "currency",
	...partial,
});

// Payload típico do agent (mesmo shape da screenshot do bug: bem + parcela + prazo)
const FIELDS: ValuePickerField[] = [
	field({
		id: "creditValue",
		label: "Valor do bem",
		min: 20_000,
		max: 300_000,
		step: 1_000,
		default: 80_000,
	}),
	field({
		id: "monthlyBudget",
		label: "Parcela mensal",
		min: 300,
		max: 5_000,
		step: 100,
		default: 2_000,
	}),
	field({ id: "term", label: "Prazo", min: 24, max: 100, step: 1, default: 60, format: "months" }),
];

describe("FIX-16 — identifyLinkRoles (payload genérico → papéis)", () => {
	it("identifica bem/parcela/prazo pelos ids canônicos do schema", () => {
		expect(identifyLinkRoles(FIELDS)).toEqual({
			assetId: "creditValue",
			monthlyId: "monthlyBudget",
			termId: "term",
		});
	});

	it("identifica ids em português que o agent pode inventar", () => {
		const roles = identifyLinkRoles([
			field({ id: "valorBem", max: 300_000 }),
			field({ id: "parcelaMensal", max: 5_000 }),
			field({ id: "prazoMeses", format: "months", max: 100 }),
		]);
		expect(roles).toEqual({
			assetId: "valorBem",
			monthlyId: "parcelaMensal",
			termId: "prazoMeses",
		});
	});

	it("sem slider de prazo → roles sem termId (usa prazo típico da categoria)", () => {
		const roles = identifyLinkRoles([
			field({ id: "creditValue", max: 300_000 }),
			field({ id: "monthlyBudget", max: 5_000 }),
		]);
		expect(roles).toEqual({
			assetId: "creditValue",
			monthlyId: "monthlyBudget",
			termId: undefined,
		});
	});

	it("ids opacos → fallback: maior teto é o bem, menor é a parcela", () => {
		const roles = identifyLinkRoles([
			field({ id: "a", max: 5_000 }),
			field({ id: "b", max: 300_000 }),
		]);
		expect(roles).toEqual({ assetId: "b", monthlyId: "a", termId: undefined });
	});

	it("menos de 2 campos currency → null (degrada pro comportamento solto)", () => {
		expect(identifyLinkRoles([field({ id: "creditValue" })])).toBeNull();
		expect(
			identifyLinkRoles([field({ id: "creditValue" }), field({ id: "term", format: "months" })]),
		).toBeNull();
	});
});

describe("FIX-16 — recalcLinkedValues (matemática de consórcio)", () => {
	const base = { creditValue: 80_000, monthlyBudget: 2_000, term: 60 };
	const roles = identifyLinkRoles(FIELDS);
	if (!roles) throw new Error("roles do payload de teste deveriam ser identificáveis");
	const recalc = (values: Record<string, number>, changedId: string) =>
		recalcLinkedValues({ fields: FIELDS, roles, category: "auto", values, changedId });

	it("arrastou a PARCELA → o bem deriva de parcela × prazo / (1+taxa típica)", () => {
		const out = recalc(base, "monthlyBudget");
		// auto: 15% típica → 2000 × 60 / 1.15 = 104.347,82 → snap step 1000 = 104.000
		expect(TYPICAL_ADMIN_FEE_PCT.auto).toBe(15);
		expect(out.creditValue).toBe(104_000);
		// os campos arrastados ficam intactos
		expect(out.monthlyBudget).toBe(2_000);
		expect(out.term).toBe(60);
	});

	it("arrastou o PRAZO → o bem se ajusta mantendo a parcela", () => {
		const out = recalc({ ...base, term: 80 }, "term");
		// 2000 × 80 / 1.15 = 139.130 → snap 139.000
		expect(out.creditValue).toBe(139_000);
	});

	it("MONOTONICIDADE (pedido literal): parcela ↑ → bem ↑; prazo ↑ → bem ↑", () => {
		const lowMonthly = recalc({ ...base, monthlyBudget: 1_000 }, "monthlyBudget").creditValue;
		const highMonthly = recalc({ ...base, monthlyBudget: 3_000 }, "monthlyBudget").creditValue;
		expect(highMonthly).toBeGreaterThan(lowMonthly);

		const shortTerm = recalc({ ...base, term: 36 }, "term").creditValue;
		const longTerm = recalc({ ...base, term: 90 }, "term").creditValue;
		expect(longTerm).toBeGreaterThan(shortTerm);
	});

	it("arrastou o BEM → a parcela deriva de bem × (1+taxa) / prazo (prazo fixo)", () => {
		const out = recalc({ ...base, creditValue: 104_000 }, "creditValue");
		// 104.000 × 1.15 / 60 = 1.993,33 → snap step 100 = 2.000
		expect(out.monthlyBudget).toBe(2_000);
		expect(out.term).toBe(60);
	});

	it("derivado respeita os bounds do slider (clamp no max)", () => {
		const out = recalc({ ...base, monthlyBudget: 5_000, term: 100 }, "monthlyBudget");
		// 5000 × 100 / 1.15 = 434.782 → clamp no max do field (300.000)
		expect(out.creditValue).toBe(300_000);
	});

	it("sem slider de prazo → usa o prazo TÍPICO da categoria", () => {
		const twoFields = FIELDS.slice(0, 2);
		const r2 = identifyLinkRoles(twoFields);
		if (!r2) throw new Error("2 campos currency deveriam ser identificáveis");
		const out = recalcLinkedValues({
			fields: twoFields,
			roles: r2,
			category: "auto",
			values: { creditValue: 80_000, monthlyBudget: 2_000 },
			changedId: "monthlyBudget",
		});
		// typical auto = 80 meses → 2000 × 80 / 1.15 = 139.130 → snap 139.000
		expect(TYPICAL_TERM_MONTHS.auto).toBe(80);
		expect(out.creditValue).toBe(139_000);
	});

	it("usa a taxa típica DA CATEGORIA (imóvel ≠ auto)", () => {
		const out = recalcLinkedValues({
			fields: FIELDS,
			roles,
			category: "imovel",
			values: base,
			changedId: "monthlyBudget",
		});
		// imóvel: 18.5% → 2000 × 60 / 1.185 = 101.265 → snap 101.000
		expect(out.creditValue).toBe(101_000);
	});

	it("campo fora dos papéis arrastado → valores intactos (nunca interliga errado)", () => {
		const values = { ...base, extra: 42 };
		expect(recalc(values, "extra")).toEqual(values);
	});
});
