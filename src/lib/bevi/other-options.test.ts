import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { fixtureDiscoveryAdapter } from "../../../tests/helpers/fixture-discovery-adapter";
import { buildOtherOptions } from "./other-options";

// docx passo 4 (linha 37): "Permitir ver 'Outras opções' (as outras 2) pra
// comparação simples." Surfacing DETERMINÍSTICO das outras ofertas REAIS da
// descoberta — módulo único consumido pelo route e pelo harness do eval.

beforeAll(() => __setDiscoveryAdapterFactoryForTests(() => fixtureDiscoveryAdapter()));
afterAll(() => __setDiscoveryAdapterFactoryForTests(null));

const META = {
	currentCategory: "auto",
	recommendedAdministradora: "ITAÚ",
	qualifyAnswers: { creditMin: 90_000, creditMax: 100_000 },
} as ConversationMetadata;

describe("buildOtherOptions — as outras 2 ofertas reais (docx passo 4)", () => {
	it("retorna até 2 ofertas excluindo a recomendada", async () => {
		const result = await buildOtherOptions("conv-others-1", META);
		expect(result.groups.length).toBeLessThanOrEqual(2);
		expect(result.groups.length).toBeGreaterThan(0);
		for (const g of result.groups) {
			expect(g.administradora).not.toBe("ITAÚ");
		}
	});

	it("texto convida à comparação (copy do route)", async () => {
		const result = await buildOtherOptions("conv-others-2", META);
		expect(result.text.toLowerCase()).toMatch(/outras opções|outras opcoes/);
		expect(result.text.toLowerCase()).toMatch(/compara/);
	});

	it("sem categoria lança (route cai no fallback de retry)", async () => {
		await expect(
			buildOtherOptions("conv-others-3", { ...META, currentCategory: undefined }),
		).rejects.toThrow(/categoria/);
	});
});
