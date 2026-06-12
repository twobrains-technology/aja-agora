import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import type { AdministradoraAdapter, GroupSummary } from "@/lib/adapters/types";
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

// FIX-28 — dedupe das cotas equivalentes + exclusão PRECISA da recomendada.
// O SUT (buildOtherOptions) consome GroupSummary[] (saída de searchGroups); o
// dedupe/exclusão operam nesse nível. Valores = captura real do print (ÂNCORA
// R$ 80.000 · R$ 954/mês · 117m), com cotas distintas de mesmos valores (comum
// no Trilho B). Achado no DB do dev: meta não tem groupId → exclusão por
// equivalência via recommendedOffer.
describe("FIX-28 — dedupe + exclusão precisa da recomendada", () => {
	let nextGroups: GroupSummary[] = [];
	beforeEach(() => {
		__setDiscoveryAdapterFactoryForTests(
			() => ({ searchGroups: async () => nextGroups }) as unknown as AdministradoraAdapter,
		);
	});
	afterEach(() => {
		__setDiscoveryAdapterFactoryForTests(() => fixtureDiscoveryAdapter());
	});

	function group(over: Partial<GroupSummary> & { id: string }): GroupSummary {
		return {
			administradora: "ÂNCORA",
			category: "auto",
			creditValue: 80_000,
			monthlyPayment: 954,
			adminFeePercent: 18,
			termMonths: 117,
			totalParticipants: 400,
			availableSlots: 5,
			contemplationRate: 2,
			...over,
		};
	}

	const ancoraRecommended = {
		administradora: "ÂNCORA",
		category: "auto" as const,
		creditValue: 80_000,
		termMonths: 117,
		monthlyPayment: 954,
	};

	it("dedupa cotas equivalentes (mesma adm + valores) — nada de 2 cards idênticos", async () => {
		nextGroups = [
			group({ id: "anc-80k-a" }),
			group({ id: "anc-80k-b" }), // cota distinta, valores idênticos
			group({ id: "anc-60k", creditValue: 60_000, monthlyPayment: 720 }),
		];
		const res = await buildOtherOptions("fix28-1", {
			currentCategory: "auto",
			recommendedAdministradora: "RODOBENS",
		} as ConversationMetadata);
		const keys = res.groups.map(
			(g) => `${g.administradora}|${g.creditValue}|${g.monthlyPayment}|${g.termMonths}`,
		);
		expect(new Set(keys).size).toBe(keys.length); // sem equivalentes repetidos
		expect(res.groups.filter((g) => g.creditValue === 80_000)).toHaveLength(1);
	});

	it("exclui a recomendada por equivalência mesmo com a MESMA administradora (ÂNCORA)", async () => {
		nextGroups = [
			group({ id: "anc-80k" }), // = recomendada
			group({ id: "anc-60k-a", creditValue: 60_000, monthlyPayment: 720 }),
			group({ id: "anc-60k-b", creditValue: 60_000, monthlyPayment: 720 }), // dup
		];
		const res = await buildOtherOptions("fix28-2", {
			currentCategory: "auto",
			recommendedAdministradora: "ÂNCORA",
			recommendedOffer: ancoraRecommended,
		} as ConversationMetadata);
		expect(res.groups.every((g) => g.creditValue !== 80_000)).toBe(true); // recomendada fora
		expect(res.groups).toHaveLength(1); // 60k aparece UMA vez
		expect(res.groups[0].creditValue).toBe(60_000);
	});

	it("degrada com honestidade: sobra 0 após dedupe+exclusão → erro tratado (como hoje)", async () => {
		nextGroups = [group({ id: "anc-80k-a" }), group({ id: "anc-80k-b" })]; // só a recomendada (+dup)
		await expect(
			buildOtherOptions("fix28-3", {
				currentCategory: "auto",
				recommendedAdministradora: "ÂNCORA",
				recommendedOffer: ancoraRecommended,
			} as ConversationMetadata),
		).rejects.toThrow();
	});
});
