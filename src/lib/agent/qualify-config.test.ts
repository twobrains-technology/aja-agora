import { describe, expect, it } from "vitest";
import {
	clampCreditToCategory,
	CREDIT_BOUNDS,
	CREDIT_BUCKETS,
} from "./qualify-config";

// FIX-54 (jornada2_revisão.docx, Bernardo): "Carro - está indo só até 300k".
// O teto de `auto` em CREDIT_BOUNDS (fonte única dos sliders web + clamp
// server-side) estava em R$ 300.000 — carros novos/premium passam disso.
// Decisão (docs/correcoes/decisions/2026-06-19-bloco-b-simulador.md): elevar
// para R$ 500.000 (alinha com `servicos`, cobre premium sem virar irreal).
describe("FIX-54 — teto de carro elevado em CREDIT_BOUNDS", () => {
	const NOVO_TETO_AUTO = 500_000;

	it("CREDIT_BOUNDS.auto.max alcança ao menos o novo teto (>= R$ 500 mil)", () => {
		expect(CREDIT_BOUNDS.auto.max).toBeGreaterThanOrEqual(NOVO_TETO_AUTO);
	});

	it("clampCreditToCategory aceita carta acima de 300k para auto sem clampar", () => {
		const r = clampCreditToCategory(400_000, "auto");
		expect(r.value).toBe(400_000);
		expect(r.clamped).toBe(false);
	});

	it("clampCreditToCategory aceita exatamente o novo teto para auto", () => {
		const r = clampCreditToCategory(NOVO_TETO_AUTO, "auto");
		expect(r.value).toBe(NOVO_TETO_AUTO);
		expect(r.clamped).toBe(false);
	});

	it("acima do novo teto ainda clampa (guardrail server-side preservado)", () => {
		const r = clampCreditToCategory(NOVO_TETO_AUTO + 50_000, "auto");
		expect(r.value).toBe(CREDIT_BOUNDS.auto.max);
		expect(r.clamped).toBe(true);
	});

	it("min/default de auto permanecem coerentes (não regrediram)", () => {
		expect(CREDIT_BOUNDS.auto.min).toBe(20_000);
		expect(CREDIT_BOUNDS.auto.default).toBe(80_000);
		expect(CREDIT_BOUNDS.auto.default).toBeGreaterThan(CREDIT_BOUNDS.auto.min);
		expect(CREDIT_BOUNDS.auto.default).toBeLessThan(CREDIT_BOUNDS.auto.max);
	});

	it("coerência multicanal: último bucket WhatsApp de auto acompanha o novo teto", () => {
		const ultimo = CREDIT_BUCKETS.auto[CREDIT_BUCKETS.auto.length - 1];
		expect(ultimo.max).toBeGreaterThanOrEqual(NOVO_TETO_AUTO);
	});
});
