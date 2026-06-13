import { describe, expect, it } from "vitest";
import { evalDimensionSchema, evalResultSchema } from "./types";

describe("evalDimensionSchema (regras de design)", () => {
	it("aceita score fora do intervalo (clamp acontece no pipeline)", () => {
		expect(evalDimensionSchema.safeParse({ score: 1.2, reasoning: "x" }).success).toBe(true);
		expect(evalDimensionSchema.safeParse({ score: -0.1, reasoning: "x" }).success).toBe(true);
	});

	it("exige reasoning não-vazio (juiz precisa justificar a nota)", () => {
		expect(evalDimensionSchema.safeParse({ score: 0.5, reasoning: "" }).success).toBe(false);
	});
});

describe("evalResultSchema (regras de design)", () => {
	const validDimension = { score: 0.8, reasoning: "x" };
	const validResult = {
		dimensions: {
			engajamento: validDimension,
			discovery: validDimension,
			continuidade: validDimension,
			naturalidade: validDimension,
			assertividade: validDimension,
			conversao: validDimension,
		},
		flags: {
			hallucination: false,
			missedHandoff: false,
			incompleteDiscovery: false,
			lowEngagement: false,
		},
		overallScore: 0.82,
		topIssues: ["x"],
		topStrengths: ["y"],
	};

	it("aceita topIssues e topStrengths > 3 (cap acontece no pipeline)", () => {
		expect(
			evalResultSchema.safeParse({ ...validResult, topIssues: ["a", "b", "c", "d"] }).success,
		).toBe(true);
		expect(
			evalResultSchema.safeParse({ ...validResult, topStrengths: ["a", "b", "c", "d"] }).success,
		).toBe(true);
	});

	it("aceita topIssues vazio (conversa sem problemas é caso válido)", () => {
		expect(evalResultSchema.safeParse({ ...validResult, topIssues: [] }).success).toBe(true);
	});
});
