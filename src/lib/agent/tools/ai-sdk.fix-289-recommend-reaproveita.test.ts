/**
 * FIX-289 — `recommend_groups` rebuscava do zero o que `search_groups` já
 * trouxe no MESMO turno. `executeRecommendGroups` chamava incondicionalmente
 * `recommendWithFallback(adapter, searchParams)`, que SEMPRE invoca
 * `adapter.searchGroups(params)` de novo — round-trip redundante à Bevi
 * (latência real do dossiê, veredito-r9pos2-sonnet.md §1/§3).
 *
 * Este teste prova que, quando `recommend_groups` é chamado no MESMO turno
 * (mesmo `buildConsorcioTools`) logo após `search_groups` com parâmetros
 * equivalentes (category/creditMin/creditMax), o adapter NÃO é rebuscado —
 * `recommend_groups` reaproveita os grupos já obtidos. Com parâmetros
 * DIVERGENTES, uma busca real continua disparando (o dedupe não pode
 * esconder uma busca genuinamente necessária).
 *
 * NÃO paraleliza chamadas à Bevi (PENDENTE-KAIRO fora de escopo, ver
 * docs/correcoes/todo/bloco-r9-3-latencia-percebida/_bloco.md) — é só dedupe
 * de uma chamada redundante dentro do fluxo sequencial já existente.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { __setDiscoveryAdapterFactoryForTests } from "@/lib/adapters";
import { fixtureDiscoveryAdapter } from "../../../../tests/helpers/fixture-discovery-adapter";
import { buildConsorcioTools } from "./ai-sdk";

// biome-ignore lint/suspicious/noExplicitAny: ai-sdk tool ctx não é exportado publicamente
const FAKE_TOOL_CTX = { toolCallId: "t", messages: [] } as any;

afterEach(() => {
	__setDiscoveryAdapterFactoryForTests(null);
});

describe("FIX-289 — recommend_groups reaproveita a busca de search_groups no mesmo turno", () => {
	it("parâmetros equivalentes: adapter.searchGroups é chamado só 1 vez (não 2+)", async () => {
		const adapter = fixtureDiscoveryAdapter();
		const spy = vi.spyOn(adapter, "searchGroups");
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const tools = buildConsorcioTools({
			conversationId: "00000000-0000-4000-8000-000000000010",
		});
		const searchExec = tools.search_groups.execute;
		const recommendExec = tools.recommend_groups.execute;
		if (!searchExec || !recommendExec) throw new Error("tools execute undefined");

		await searchExec({ category: "auto", creditMin: 20_000, creditMax: 60_000 }, FAKE_TOOL_CTX);
		const result = (await recommendExec(
			{
				category: "auto",
				creditMin: 20_000,
				creditMax: 60_000,
				budget: 1_200,
				desiredTermMonths: 0,
			},
			FAKE_TOOL_CTX,
		)) as { recommendations: Array<{ administradora: string }> };

		expect(spy).toHaveBeenCalledTimes(1);
		// Ranking final ainda reflete os grupos reais retornados (dados da fixture).
		expect(result.recommendations.length).toBeGreaterThan(0);
		expect(["ITAÚ", "ÂNCORA", "BANCO DO BRASIL"]).toContain(
			result.recommendations[0].administradora,
		);
	});

	it("parâmetros DIVERGENTES: dispara uma nova busca real (não esconde busca necessária)", async () => {
		const adapter = fixtureDiscoveryAdapter();
		const spy = vi.spyOn(adapter, "searchGroups");
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const tools = buildConsorcioTools({
			conversationId: "00000000-0000-4000-8000-000000000011",
		});
		const searchExec = tools.search_groups.execute;
		const recommendExec = tools.recommend_groups.execute;
		if (!searchExec || !recommendExec) throw new Error("tools execute undefined");

		await searchExec({ category: "auto", creditMin: 20_000, creditMax: 60_000 }, FAKE_TOOL_CTX);
		await recommendExec(
			{
				category: "auto",
				creditMin: 200_000,
				creditMax: 400_000,
				budget: 1_200,
				desiredTermMonths: 0,
			},
			FAKE_TOOL_CTX,
		);

		expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("sem search_groups anterior no turno: recommend_groups busca normalmente (sem regressão)", async () => {
		const adapter = fixtureDiscoveryAdapter();
		const spy = vi.spyOn(adapter, "searchGroups");
		__setDiscoveryAdapterFactoryForTests(() => adapter);

		const tools = buildConsorcioTools({
			conversationId: "00000000-0000-4000-8000-000000000012",
		});
		const recommendExec = tools.recommend_groups.execute;
		if (!recommendExec) throw new Error("recommend_groups.execute undefined");

		const result = (await recommendExec(
			{
				category: "auto",
				creditMin: 20_000,
				creditMax: 60_000,
				budget: 1_200,
				desiredTermMonths: 0,
			},
			FAKE_TOOL_CTX,
		)) as { recommendations: Array<{ administradora: string }> };

		expect(spy).toHaveBeenCalledTimes(1);
		expect(result.recommendations.length).toBeGreaterThan(0);
	});
});
