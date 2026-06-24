import { describe, expect, it } from "vitest";
import {
	comparisonTableSchema,
	groupCardSchema,
	looksLikeFabricatedGroupId,
	recommendationSchema,
} from "./ai-sdk";

/**
 * Camada 1 (structural) — FIX-71.
 *
 * (a) Os cards que listam grupos (present_group_card / present_comparison_table /
 *     present_recommendation_card) carregam o id LITERAL e opaco de cada grupo, e
 *     a descricao do campo manda usar EXATAMENTE o id vindo de search/recommend —
 *     proibindo derivar um slug banco-categoria-valor-prazo.
 * (b) O detector server-side `looksLikeFabricatedGroupId` reconhece o id fabricado
 *     pela LLM (padrao "...-NNNk-NNm") e nao confunde com o id real (hash opaco).
 */
describe("FIX-71 — cards expoem o id LITERAL e a descricao proibe slug derivado", () => {
	const idDescOf = (schema: { description?: string }) => schema.description ?? "";

	it("group_card / comparison_table: cada grupo exige id e a descricao manda usar o literal", () => {
		// id obrigatorio no card de grupo
		expect(groupCardSchema.shape.id).toBeDefined();
		// comparison_table reusa o group card (omit availableSlots/contemplationRate) — mantem o id
		const groupInTable = comparisonTableSchema.shape.groups.element.shape.id;
		expect(groupInTable).toBeDefined();

		for (const desc of [idDescOf(groupCardSchema.shape.id), idDescOf(groupInTable)]) {
			expect(desc).toMatch(/literal|opac|search_groups|recommend/i);
			expect(desc).toMatch(/nunca\s+(derive|fabrique|invente)/i);
		}
	});

	it("recommendation_card: id exige o literal opaco da descoberta, sem slug derivado", () => {
		const desc = idDescOf(recommendationSchema.shape.id);
		expect(desc).toMatch(/literal|opac|search_groups|recommend/i);
		expect(desc).toMatch(/nunca\s+(derive|fabrique|invente)/i);
	});
});

describe("FIX-71 — detector server-side de groupId fabricado", () => {
	it("reconhece o id fabricado (banco-categoria-valor-prazo) observado em prod", () => {
		expect(looksLikeFabricatedGroupId("bb-auto-200k-72m")).toBe(true);
		// forma do FIX-68 (categoria-valor-prazo) tambem cai no detector
		expect(looksLikeFabricatedGroupId("auto-130k-60m")).toBe(true);
		expect(looksLikeFabricatedGroupId("auto-256k-60m")).toBe(true);
	});

	it("NAO confunde o id real (hash opaco de 24 chars) com fabricado", () => {
		expect(looksLikeFabricatedGroupId("6a0ca9ca1b2c3d4e5f607182")).toBe(false);
		expect(looksLikeFabricatedGroupId("7c3d115ee0fd6da59f9d18e1")).toBe(false);
		expect(looksLikeFabricatedGroupId("")).toBe(false);
	});
});
