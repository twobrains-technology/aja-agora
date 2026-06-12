import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, ConversationMetadata } from "@/lib/agent/personas";
import { clampCreditToCategory } from "@/lib/agent/qualify-config";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";
import { analyzeAndMerge } from "./analyze";

// FIX-33 — guardrail server-side do valor de carta na faixa da categoria.
// Auditoria 2026-06-12: o valor extraído por TEXTO LIVRE ("quero uma carta de 5
// milhões de auto") não tinha clamp — passava pelo funil até morrer na Bevi ou
// retornar oferta absurda. Os sliders da UI já limitam por CREDIT_BOUNDS; o
// caminho de texto livre não. Este fix aplica o mesmo teto/piso no merge do
// analyzer.

// Mock do analyzer LLM — controla o `analysis.creditMax` extraído.
vi.mock("@/lib/agent/turn-analyzer", () => ({ analyzeTurn: vi.fn() }));

import { analyzeTurn } from "@/lib/agent/turn-analyzer";

const NEUTRAL: TurnAnalysis = {
	reasoning: "t",
	detectedCategory: null,
	detectedSubTopic: null,
	isExplicitSwitch: false,
	expertiseLevel: "neutro",
	experiencePrev: null,
	creditMin: null,
	creditMax: null,
	prazoMeses: null,
	hasLance: null,
	userIntent: "neutral",
};

describe("FIX-33 — clampCreditToCategory (função pura)", () => {
	it("acima do teto clampa no teto (auto: 300k)", () => {
		const r = clampCreditToCategory(5_000_000, "auto");
		expect(r.value).toBe(300_000);
		expect(r.clamped).toBe(true);
		expect(r.max).toBe(300_000);
		expect(r.min).toBe(20_000);
	});

	it("abaixo do piso clampa no piso (auto: 20k)", () => {
		const r = clampCreditToCategory(500, "auto");
		expect(r.value).toBe(20_000);
		expect(r.clamped).toBe(true);
		expect(r.min).toBe(20_000);
	});

	it("dentro da faixa passa intacto (clamped=false)", () => {
		const r = clampCreditToCategory(150_000, "auto");
		expect(r.value).toBe(150_000);
		expect(r.clamped).toBe(false);
	});

	it.each<[Category, number, number]>([
		["imovel", 5_000_000, 2_000_000],
		["imovel", 50_000, 100_000],
		["auto", 5_000_000, 300_000],
		["auto", 500, 20_000],
		["moto", 200_000, 80_000],
		["moto", 1_000, 8_000],
		["servicos", 9_000_000, 500_000],
		["servicos", 100, 10_000],
	])("matriz %s: %d clampa pra %d", (cat, input, expected) => {
		expect(clampCreditToCategory(input, cat).value).toBe(expected);
	});
});

describe("FIX-33 — analyzeAndMerge aplica o clamp na faixa da categoria", () => {
	beforeEach(() => {
		vi.mocked(analyzeTurn).mockReset();
	});

	it("carta de 5 milhões de auto → creditMax clampado (300k), creditClampedFrom=5M", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 5_000_000 });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("quero uma carta de 5 milhoes de auto", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(300_000);
		expect(meta.qualifyAnswers?.creditClampedFrom).toBe(5_000_000);
		// creditMin derivado respeita a faixa.
		expect(meta.qualifyAnswers?.creditMin).toBeLessThanOrEqual(300_000);
		expect(meta.qualifyAnswers?.creditMin ?? 0).toBeGreaterThan(0);
	});

	it("valor dentro da faixa NÃO marca clamp", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 150_000 });
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("uns 150 mil", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(150_000);
		expect(meta.qualifyAnswers?.creditClampedFrom).toBeUndefined();
	});

	it("creditMin extraído acima do teto também herda o clamp", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({
			...NEUTRAL,
			creditMax: 5_000_000,
			creditMin: 4_000_000,
		});
		const meta: ConversationMetadata = { currentCategory: "auto" };
		await analyzeAndMerge("entre 4 e 5 milhoes", "auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(300_000);
		expect(meta.qualifyAnswers?.creditMin).toBeLessThanOrEqual(300_000);
	});

	it("sem categoria definida NÃO clampa (defensivo — sem faixa de referência)", async () => {
		vi.mocked(analyzeTurn).mockResolvedValue({ ...NEUTRAL, creditMax: 5_000_000 });
		const meta: ConversationMetadata = {};
		await analyzeAndMerge("5 milhoes", "concierge", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(5_000_000);
		expect(meta.qualifyAnswers?.creditClampedFrom).toBeUndefined();
	});
});
