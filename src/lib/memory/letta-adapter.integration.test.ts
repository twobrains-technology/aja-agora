// src/lib/memory/letta-adapter.integration.test.ts
//
// Integration tests REAIS contra o container `tb-letta-shared` local. Plano §4.
//
// Pré-condições: subir `./.claude/skills/local-dev/scripts/shared-up.sh` antes.
// Skip automático se `LETTA_BASE_URL` ou `LETTA_API_KEY` ausentes.
//
// Cleanup: cada describe usa namespace dedicado + afterAll deleta todos os
// agents criados via DELETE /v1/agents/{id}.

import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LettaMemoryAdapter } from "./letta-adapter";
import { lettaFetch, lettaHealthCheck, resetLettaBaseUrlCache } from "./letta-client";
import type { MemoryEntry, UserIdentity } from "./types";

const HAS_LETTA = Boolean(process.env.LETTA_BASE_URL && process.env.LETTA_API_KEY);
const describeIfLetta = HAS_LETTA ? describe : describe.skip;

// Namespace único por run pra isolar de qualquer agent dev manual
const TEST_NAMESPACE = `aja-agora-test-vitest-${randomBytes(4).toString("hex")}`;

function newCookieIdentity(): UserIdentity {
	return {
		kind: "anon-cookie",
		value: randomBytes(16).toString("hex"),
		namespace: TEST_NAMESPACE,
	};
}

function newPhoneIdentity(): UserIdentity {
	// gera phone único: +5511 + 9 random digits
	const tail = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");
	return {
		kind: "phone",
		value: `+5511${tail}`,
		namespace: TEST_NAMESPACE,
	};
}

interface LettaAgentList {
	id: string;
	name: string;
	tags?: string[];
}

async function deleteAgentSafe(agentId: string): Promise<void> {
	try {
		await lettaFetch(`/v1/agents/${agentId}`, { method: "DELETE", timeoutMs: 5000 });
	} catch (err) {
		// Não-fatal: cleanup best-effort
		console.warn(`[test cleanup] DELETE agent ${agentId} falhou:`, String(err));
	}
}

async function listAgentsByNamespace(namespace: string): Promise<LettaAgentList[]> {
	// Letta `?tags=...` filtra por tag exata
	const tag = `namespace:${namespace}`;
	return lettaFetch<LettaAgentList[]>(`/v1/agents/?tags=${encodeURIComponent(tag)}&limit=200`, {
		timeoutMs: 5000,
	});
}

describeIfLetta("LettaMemoryAdapter (integration, real Letta)", () => {
	const adapter = new LettaMemoryAdapter();
	const createdAgentIds = new Set<string>();

	beforeAll(async () => {
		resetLettaBaseUrlCache();
		const ok = await lettaHealthCheck(3000);
		if (!ok) {
			throw new Error(
				`Letta unreachable at ${process.env.LETTA_BASE_URL}. Run shared-up.sh first.`,
			);
		}
	}, 10_000);

	afterAll(async () => {
		// Cleanup: lista tudo do namespace de teste e deleta
		try {
			const agents = await listAgentsByNamespace(TEST_NAMESPACE);
			for (const a of agents) {
				await deleteAgentSafe(a.id);
			}
		} catch (err) {
			console.warn("[test cleanup] listing agents failed:", String(err));
		}
		// Tenta também os trackados explicitamente (caso o tag-filter falhe)
		for (const id of createdAgentIds) {
			await deleteAgentSafe(id);
		}
	}, 60_000);

	describe("findOrCreateAgent (via storeMemories)", () => {
		it("cria agent na primeira chamada", async () => {
			const identity = newCookieIdentity();
			await adapter.storeMemories(identity, [], {
				conversationId: "conv-integ-1",
				channel: "web",
			});

			const ctx = await adapter.loadContext(identity, { timeoutMs: 5000 });
			expect(ctx).not.toBeNull();
			expect(ctx?.agentId).toBeDefined();
			if (ctx?.agentId) createdAgentIds.add(ctx.agentId);
		}, 30_000);

		it("idempotente: 2 calls com mesma identity retornam mesmo agent", async () => {
			const identity = newCookieIdentity();

			await adapter.storeMemories(identity, [], {
				conversationId: "conv-idem-1",
				channel: "web",
			});
			const ctx1 = await adapter.loadContext(identity, { timeoutMs: 5000 });
			expect(ctx1?.agentId).toBeDefined();

			await adapter.storeMemories(identity, [], {
				conversationId: "conv-idem-2",
				channel: "web",
			});
			const ctx2 = await adapter.loadContext(identity, { timeoutMs: 5000 });

			expect(ctx2?.agentId).toBe(ctx1?.agentId);
			if (ctx1?.agentId) createdAgentIds.add(ctx1.agentId);
		}, 30_000);
	});

	describe("storeMemories → loadContext round-trip", () => {
		it("block populated com name, stage, category, channels + archival com 2 entries", async () => {
			const identity = newCookieIdentity();
			const entries: MemoryEntry[] = [
				{
					text: "Simulou consórcio de R$ 100.000 em 60 meses, parcela R$ 2.000.",
					kind: "simulation",
				},
				{
					text: "Visualizou grupo Honda Civic LX (grupo grp-test-123).",
					kind: "preference",
				},
			];

			await adapter.storeMemories(identity, entries, {
				conversationId: "conv-roundtrip-1",
				channel: "web",
				blockPatch: {
					name: "Alan",
					stage: "qualificado",
					category: "auto",
					objections: ["preço alto"],
				},
			});

			const ctx = await adapter.loadContext(identity, {
				timeoutMs: 5000,
				archivalQuery: "Honda Civic",
			});
			expect(ctx).not.toBeNull();
			if (ctx?.agentId) createdAgentIds.add(ctx.agentId);

			expect(ctx?.block.name).toBe("Alan");
			expect(ctx?.block.stage).toBe("qualificado");
			expect(ctx?.block.category).toBe("auto");
			expect(ctx?.block.channels).toContain("web");
			expect(ctx?.block.objections).toContain("preço alto");
			expect(ctx?.block.lastInteractionAt).toBeDefined();
			// archivalHits depende de embedding pronto — pode ser flaky em cold start.
			// Aqui só validamos que o array existe; o teste de search faz a query forte.
			expect(Array.isArray(ctx?.archivalHits)).toBe(true);
		}, 60_000);

		it("channels merge real: web → whatsapp = ['web','whatsapp']", async () => {
			const identity = newCookieIdentity();

			await adapter.storeMemories(identity, [], {
				conversationId: "conv-ch-1",
				channel: "web",
			});
			await adapter.storeMemories(identity, [], {
				conversationId: "conv-ch-2",
				channel: "whatsapp",
			});

			const ctx = await adapter.loadContext(identity, { timeoutMs: 5000 });
			if (ctx?.agentId) createdAgentIds.add(ctx.agentId);
			expect(ctx?.block.channels?.sort()).toEqual(["web", "whatsapp"]);
		}, 30_000);

		it("objections dedup: 2 stores com 'preço' → 1 só no block", async () => {
			const identity = newCookieIdentity();
			await adapter.storeMemories(identity, [], {
				conversationId: "conv-obj-1",
				channel: "web",
				blockPatch: { objections: ["preço alto"] },
			});
			await adapter.storeMemories(identity, [], {
				conversationId: "conv-obj-2",
				channel: "web",
				blockPatch: { objections: ["preço alto", "prazo"] },
			});

			const ctx = await adapter.loadContext(identity, { timeoutMs: 5000 });
			if (ctx?.agentId) createdAgentIds.add(ctx.agentId);
			const objections = ctx?.block.objections ?? [];
			expect(objections.filter((o) => o === "preço alto").length).toBe(1);
			expect(objections).toContain("prazo");
		}, 30_000);
	});

	describe("searchArchival", () => {
		it("agent inexistente retorna [] (sem throw)", async () => {
			const identity = newCookieIdentity(); // nunca foi populado
			const hits = await adapter.searchArchival(identity, "qualquer coisa", 5);
			expect(hits).toEqual([]);
		}, 10_000);

		it("semantic match: insere 'Honda Civic 60 meses' + 'objeção contemplação', busca 'contemplação' → retorna hit", async () => {
			const identity = newCookieIdentity();
			await adapter.storeMemories(
				identity,
				[
					{
						text: "Simulou Honda Civic em 60 meses, R$ 100k.",
						kind: "simulation",
					},
					{
						text: "Tem dúvida sobre como funciona contemplação no consórcio.",
						kind: "objection",
					},
				],
				{ conversationId: "conv-search-1", channel: "web" },
			);

			// Embedding cold start pode demorar; aceita até 8s ali
			const hits = await adapter.searchArchival(identity, "contemplação", 5);

			// Trackeia o agent pra cleanup
			const ctx = await adapter.loadContext(identity, { timeoutMs: 5000 });
			if (ctx?.agentId) createdAgentIds.add(ctx.agentId);

			expect(hits.length).toBeGreaterThanOrEqual(1);
			// O hit mais relevante deve mencionar contemplação
			const hasContemplacao = hits.some((h) => h.text.toLowerCase().includes("contemplação"));
			expect(hasContemplacao).toBe(true);
		}, 90_000);
	});

	describe("reconcileIdentity", () => {
		it("cria 2 agents (cookie + phone), reconcile copia archival e seta reconciledFrom", async () => {
			const cookieId = newCookieIdentity();
			const phoneId = newPhoneIdentity();

			// Popula o cookie agent com algumas memories
			await adapter.storeMemories(
				cookieId,
				[
					{ text: "Visitou site, demonstrou interesse em auto.", kind: "fact" },
					{ text: "Simulou R$ 80k em 48 meses.", kind: "simulation" },
				],
				{
					conversationId: "conv-recon-1",
					channel: "web",
					blockPatch: { category: "auto", creditMax: 80000 },
				},
			);

			// Popula phone com algo mínimo (lead capture)
			await adapter.storeMemories(phoneId, [], {
				conversationId: "conv-recon-2",
				channel: "web",
				blockPatch: { name: "Ana" },
			});

			// Reconcile cookie → phone
			await adapter.reconcileIdentity(cookieId, phoneId);

			const phoneCtx = await adapter.loadContext(phoneId, { timeoutMs: 5000 });
			const cookieCtx = await adapter.loadContext(cookieId, { timeoutMs: 5000 });
			if (phoneCtx?.agentId) createdAgentIds.add(phoneCtx.agentId);
			if (cookieCtx?.agentId) createdAgentIds.add(cookieCtx.agentId);

			expect(phoneCtx?.block.reconciledFrom).toBe(cookieCtx?.agentId);
			// Destino "vence" em campos sobrepostos → name preservado
			expect(phoneCtx?.block.name).toBe("Ana");
			// Mas category herdada da origem (não tinha no destino)
			expect(phoneCtx?.block.category).toBe("auto");
		}, 90_000);

		it("idempotência real: chamar 2x não duplica entries no destino", async () => {
			const cookieId = newCookieIdentity();
			const phoneId = newPhoneIdentity();

			await adapter.storeMemories(
				cookieId,
				[{ text: "Memória única de teste idempotência.", kind: "fact" }],
				{ conversationId: "conv-idem-recon-1", channel: "web" },
			);
			await adapter.storeMemories(phoneId, [], {
				conversationId: "conv-idem-recon-2",
				channel: "web",
			});

			await adapter.reconcileIdentity(cookieId, phoneId);

			const ctx1 = await adapter.loadContext(phoneId, {
				timeoutMs: 5000,
				archivalQuery: "memória única",
			});
			const hitsFirst = ctx1?.archivalHits.length ?? 0;

			// Chama de novo
			await adapter.reconcileIdentity(cookieId, phoneId);

			const ctx2 = await adapter.loadContext(phoneId, {
				timeoutMs: 5000,
				archivalQuery: "memória única",
			});
			const hitsSecond = ctx2?.archivalHits.length ?? 0;

			if (ctx2?.agentId) createdAgentIds.add(ctx2.agentId);
			const cookieCtx = await adapter.loadContext(cookieId, { timeoutMs: 5000 });
			if (cookieCtx?.agentId) createdAgentIds.add(cookieCtx.agentId);

			// 2ª chamada não deve adicionar passages duplicados
			expect(hitsSecond).toBe(hitsFirst);
		}, 90_000);
	});

	describe("isPersistent", () => {
		it("retorna true", () => {
			expect(adapter.isPersistent()).toBe(true);
		});
	});
});
