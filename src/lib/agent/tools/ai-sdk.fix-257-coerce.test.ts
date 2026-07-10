// FIX-257 (P1, veredito Fable r4 §P1 #1, 2026-07-10) — mesma coerção do
// schemas.ts aplicada ao `recommend_groups` (recommendGroupsSchema vive em
// ai-sdk.ts, não em schemas.ts): creditMin/creditMax/budget vêm de texto
// livre do usuário e a LLM pode mandá-los como string.
import { describe, expect, it } from "vitest";
import { recommendGroupsSchema } from "./ai-sdk";

describe("FIX-257 — recommendGroupsSchema coage creditMin/creditMax/budget string→number", () => {
	it("aceita creditMin/creditMax/budget como STRING", () => {
		const parsed = recommendGroupsSchema.parse({
			category: "auto",
			creditMin: "72000",
			creditMax: "120000",
			budget: "1800",
		});
		expect(parsed.creditMin).toBe(72000);
		expect(parsed.creditMax).toBe(120000);
		expect(parsed.budget).toBe(1800);
	});

	it("continua aceitando number puro", () => {
		const parsed = recommendGroupsSchema.parse({ category: "auto", budget: 1800 });
		expect(parsed.budget).toBe(1800);
	});

	it("desiredTermMonths aceita STRING e mantém o default 0 quando omitido", () => {
		const withString = recommendGroupsSchema.parse({
			category: "auto",
			budget: 1800,
			desiredTermMonths: "60",
		});
		expect(withString.desiredTermMonths).toBe(60);

		const omitted = recommendGroupsSchema.parse({ category: "auto", budget: 1800 });
		expect(omitted.desiredTermMonths).toBe(0);
	});

	it("string genuinamente não-numérica em budget ainda FALHA", () => {
		expect(() => recommendGroupsSchema.parse({ category: "auto", budget: "muito" })).toThrow();
	});
});
