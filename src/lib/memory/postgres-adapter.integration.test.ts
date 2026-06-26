// src/lib/memory/postgres-adapter.integration.test.ts
//
// Integration tests REAIS contra Postgres (a tabela `memory_identities`).
// Substitui o `letta-adapter.integration.test.ts` — mesmo contrato
// `MemoryAdapter`, novo backend. Skip automático se `DATABASE_URL` ausente.
//
// O que cobre (asserts de VALOR do MemoryContext, não de shape):
//   - store → load round-trip (block populado, channels, lastInteractionAt)
//   - merge de canais web → whatsapp e dedup de objections
//   - reconcile web(cookie) → phone preservando o block (continuidade do
//     produto: o usuário que começa anônimo na web e fecha pelo WhatsApp
//     não recomeça do zero) + idempotência
//   - purge remove a identidade (idempotente)
//   - identidade inexistente → null (read-side nunca throw)

import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresMemoryAdapter } from "./postgres-adapter";
import type { MemoryEntry, UserIdentity } from "./types";

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

// Namespace único por run pra isolar de qualquer dado dev manual.
const TEST_NAMESPACE = `aja-agora-test-pg-${randomBytes(4).toString("hex")}`;

function newCookieIdentity(): UserIdentity {
	return {
		kind: "anon-cookie",
		value: randomBytes(16).toString("hex"),
		namespace: TEST_NAMESPACE,
	};
}

function newPhoneIdentity(): UserIdentity {
	const tail = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, "0");
	return { kind: "phone", value: `+5511${tail}`, namespace: TEST_NAMESPACE };
}

describeIfDb("PostgresMemoryAdapter (integration, real Postgres)", () => {
	const adapter = new PostgresMemoryAdapter();
	let db: typeof import("@/db").db;
	let memoryIdentities: typeof import("@/db/schema").memoryIdentities;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		({ memoryIdentities } = await import("@/db/schema"));
	});

	afterAll(async () => {
		// Limpa tudo do namespace de teste.
		await db
			.delete(memoryIdentities)
			.where(eq(memoryIdentities.namespace, TEST_NAMESPACE));
	});

	describe("isPersistent", () => {
		it("retorna true", () => {
			expect(adapter.isPersistent()).toBe(true);
		});
	});

	describe("loadContext", () => {
		it("identidade inexistente → null (read-side não throw)", async () => {
			const ctx = await adapter.loadContext(newCookieIdentity());
			expect(ctx).toBeNull();
		});

		it("searchArchival → [] (paridade com archival morto)", async () => {
			const hits = await adapter.searchArchival(newCookieIdentity(), "qualquer", 5);
			expect(hits).toEqual([]);
		});
	});

	describe("storeMemories → loadContext round-trip", () => {
		it("block populado com name, stage, category, objections, channels", async () => {
			const identity = newCookieIdentity();
			const entries: MemoryEntry[] = [
				{ text: "Simulou consórcio de R$ 100.000 em 60 meses.", kind: "simulation" },
			];

			await adapter.storeMemories(identity, entries, {
				conversationId: "conv-pg-roundtrip-1",
				channel: "web",
				blockPatch: {
					name: "Alan",
					stage: "qualificado",
					category: "auto",
					creditMax: 100000,
					objections: ["preço alto"],
				},
			});

			const ctx = await adapter.loadContext(identity);
			expect(ctx).not.toBeNull();
			expect(ctx?.agentId).toBeDefined();
			expect(ctx?.block.name).toBe("Alan");
			expect(ctx?.block.stage).toBe("qualificado");
			expect(ctx?.block.category).toBe("auto");
			expect(ctx?.block.creditMax).toBe(100000);
			expect(ctx?.block.channels).toContain("web");
			expect(ctx?.block.objections).toContain("preço alto");
			expect(ctx?.block.lastInteractionAt).toBeDefined();
			// Acabou de gravar → 0 dias desde a última interação.
			expect(ctx?.daysSinceLastInteraction).toBe(0);
			// Archival fica vazio na fase 1 (paridade com o estado morto).
			expect(ctx?.archivalHits).toEqual([]);
		});

		it("store idempotente: 2 calls com mesma identity não duplicam a linha", async () => {
			const identity = newCookieIdentity();
			await adapter.storeMemories(identity, [], {
				conversationId: "conv-pg-idem-1",
				channel: "web",
				blockPatch: { name: "Bia" },
			});
			await adapter.storeMemories(identity, [], {
				conversationId: "conv-pg-idem-2",
				channel: "web",
				blockPatch: { stage: "engajado" },
			});

			const rows = await db
				.select()
				.from(memoryIdentities)
				.where(
					and(
						eq(memoryIdentities.namespace, identity.namespace),
						eq(memoryIdentities.kind, identity.kind),
						eq(memoryIdentities.value, identity.value),
					),
				);
			expect(rows.length).toBe(1);

			// 2º store mescla sobre o 1º (read-modify-write): name preservado, stage novo.
			const ctx = await adapter.loadContext(identity);
			expect(ctx?.block.name).toBe("Bia");
			expect(ctx?.block.stage).toBe("engajado");
		});

		it("channels merge: web → whatsapp = ['web','whatsapp']", async () => {
			const identity = newCookieIdentity();
			await adapter.storeMemories(identity, [], { conversationId: "c1", channel: "web" });
			await adapter.storeMemories(identity, [], { conversationId: "c2", channel: "whatsapp" });

			const ctx = await adapter.loadContext(identity);
			expect(ctx?.block.channels?.slice().sort()).toEqual(["web", "whatsapp"]);
		});

		it("objections dedup: 2 stores com 'preço alto' → 1 só no block", async () => {
			const identity = newCookieIdentity();
			await adapter.storeMemories(identity, [], {
				conversationId: "c1",
				channel: "web",
				blockPatch: { objections: ["preço alto"] },
			});
			await adapter.storeMemories(identity, [], {
				conversationId: "c2",
				channel: "web",
				blockPatch: { objections: ["preço alto", "prazo"] },
			});

			const ctx = await adapter.loadContext(identity);
			const objections = ctx?.block.objections ?? [];
			expect(objections.filter((o) => o === "preço alto").length).toBe(1);
			expect(objections).toContain("prazo");
		});
	});

	describe("reconcileIdentity (continuidade web → WhatsApp)", () => {
		it("reconcile cookie → phone preserva block: destino vence, origem é herdada, reconciledFrom setado", async () => {
			const cookieId = newCookieIdentity();
			const phoneId = newPhoneIdentity();

			// Origem (web anônimo): tem categoria + crédito, sem nome.
			await adapter.storeMemories(
				cookieId,
				[{ text: "Simulou R$ 80k em 48 meses.", kind: "simulation" }],
				{
					conversationId: "conv-recon-1",
					channel: "web",
					blockPatch: { category: "auto", creditMax: 80000 },
				},
			);
			// Destino (phone, lead capturado): tem nome.
			await adapter.storeMemories(phoneId, [], {
				conversationId: "conv-recon-2",
				channel: "web",
				blockPatch: { name: "Ana" },
			});

			await adapter.reconcileIdentity(cookieId, phoneId);

			const phoneCtx = await adapter.loadContext(phoneId);
			const cookieCtx = await adapter.loadContext(cookieId);

			// Destino "vence" em campos sobrepostos → name preservado.
			expect(phoneCtx?.block.name).toBe("Ana");
			// Campos só da origem são herdados (continuidade).
			expect(phoneCtx?.block.category).toBe("auto");
			expect(phoneCtx?.block.creditMax).toBe(80000);
			// Proveniência do merge aponta pra chave da origem.
			expect(phoneCtx?.block.reconciledFrom).toBe(cookieCtx?.agentId);
		});

		it("idempotência: reconcile 2x não re-mescla nem corrompe", async () => {
			const cookieId = newCookieIdentity();
			const phoneId = newPhoneIdentity();
			await adapter.storeMemories(cookieId, [], {
				conversationId: "c1",
				channel: "web",
				blockPatch: { category: "imovel" },
			});
			await adapter.storeMemories(phoneId, [], {
				conversationId: "c2",
				channel: "web",
				blockPatch: { name: "Carlos" },
			});

			await adapter.reconcileIdentity(cookieId, phoneId);
			const first = await adapter.loadContext(phoneId);
			await adapter.reconcileIdentity(cookieId, phoneId);
			const second = await adapter.loadContext(phoneId);

			expect(second?.block.name).toBe("Carlos");
			expect(second?.block.category).toBe("imovel");
			expect(second?.block.reconciledFrom).toBe(first?.block.reconciledFrom);
		});

		it("origem inexistente → no-op (nada a migrar, não throw)", async () => {
			const phoneId = newPhoneIdentity();
			await adapter.storeMemories(phoneId, [], {
				conversationId: "c1",
				channel: "web",
				blockPatch: { name: "Davi" },
			});
			await expect(
				adapter.reconcileIdentity(newCookieIdentity(), phoneId),
			).resolves.toBeUndefined();
			const ctx = await adapter.loadContext(phoneId);
			expect(ctx?.block.name).toBe("Davi");
			expect(ctx?.block.reconciledFrom).toBeUndefined();
		});
	});

	describe("purgeIdentity", () => {
		it("remove a identidade; load posterior → null", async () => {
			const identity = newCookieIdentity();
			await adapter.storeMemories(identity, [], {
				conversationId: "c1",
				channel: "web",
				blockPatch: { name: "Eva" },
			});
			expect(await adapter.loadContext(identity)).not.toBeNull();

			await adapter.purgeIdentity(identity);
			expect(await adapter.loadContext(identity)).toBeNull();
		});

		it("idempotente: purgar identidade inexistente não throw", async () => {
			await expect(adapter.purgeIdentity(newCookieIdentity())).resolves.toBeUndefined();
		});
	});
});
