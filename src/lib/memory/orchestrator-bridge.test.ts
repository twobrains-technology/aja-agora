// src/lib/memory/orchestrator-bridge.test.ts
//
// Unit tests pro bridge entre orquestrador e camada de memória. Plano §3.7.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConversationMetadata } from "@/lib/agent/personas";

import {
	loadMemoryContextForTurn,
	memorySystemMessageFromContext,
	resolveIdentityForTurn,
	storeMemoriesForTurn,
} from "./orchestrator-bridge";
import type { MemoryContext, UserIdentity } from "./types";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("resolveIdentityForTurn", () => {
	beforeEach(() => {
		vi.stubEnv("MEMORY_NAMESPACE", "test-ns");
	});

	it("whatsapp com waId válido → phone identity E.164", () => {
		const id = resolveIdentityForTurn({
			channel: "whatsapp",
			conv: { waId: "5511987654321" },
			userTurnCount: 1,
		});
		expect(id?.kind).toBe("phone");
		expect(id?.value).toBe("+5511987654321");
		expect(id?.namespace).toBe("test-ns");
	});

	it("whatsapp sem waId → null", () => {
		const id = resolveIdentityForTurn({
			channel: "whatsapp",
			conv: { waId: null },
			userTurnCount: 1,
		});
		expect(id).toBeNull();
	});

	it("whatsapp com waId inválido → null (silencioso)", () => {
		const id = resolveIdentityForTurn({
			channel: "whatsapp",
			conv: { waId: "abc" },
			userTurnCount: 1,
		});
		expect(id).toBeNull();
	});

	it("whatsapp conv null → null", () => {
		const id = resolveIdentityForTurn({
			channel: "whatsapp",
			conv: null,
			userTurnCount: 1,
		});
		expect(id).toBeNull();
	});

	it("web sem userKey → null", () => {
		const id = resolveIdentityForTurn({
			channel: "web",
			conv: null,
			userTurnCount: 5,
		});
		expect(id).toBeNull();
	});

	it("web com userKey, turnCount < 3 → null (abaixo do threshold)", () => {
		const id = resolveIdentityForTurn({
			channel: "web",
			conv: null,
			userKey: "a".repeat(32),
			userTurnCount: 2,
		});
		expect(id).toBeNull();
	});

	it("web com userKey, turnCount = 3 → anon-cookie identity", () => {
		const id = resolveIdentityForTurn({
			channel: "web",
			conv: null,
			userKey: "a".repeat(32),
			userTurnCount: 3,
		});
		expect(id?.kind).toBe("anon-cookie");
		expect(id?.value).toBe("a".repeat(32));
	});

	it("web com userKey inválido (caracteres não-hex) → null", () => {
		const id = resolveIdentityForTurn({
			channel: "web",
			conv: null,
			userKey: "!!!",
			userTurnCount: 5,
		});
		expect(id).toBeNull();
	});
});

describe("memorySystemMessageFromContext", () => {
	it("context null → null", () => {
		expect(memorySystemMessageFromContext(null)).toBeNull();
	});

	it("context com block vazio + sem hits → null", () => {
		const ctx: MemoryContext = {
			agentId: "a1",
			block: { schemaVersion: 1, objections: [], channels: [] },
			archivalHits: [],
			daysSinceLastInteraction: null,
		};
		expect(memorySystemMessageFromContext(ctx)).toBeNull();
	});

	it("context com block populado → { role: 'system', content: <string> }", () => {
		const ctx: MemoryContext = {
			agentId: "a1",
			block: {
				schemaVersion: 1,
				name: "Alan",
				objections: [],
				channels: ["web"],
			},
			archivalHits: [],
			daysSinceLastInteraction: null,
		};
		const msg = memorySystemMessageFromContext(ctx);
		expect(msg?.role).toBe("system");
		expect(msg?.content).toContain("Alan");
	});
});

describe("loadMemoryContextForTurn", () => {
	it("identity null → null, sem chamar adapter", async () => {
		// não precisamos mockar adapter; identity null short-circuits.
		const r = await loadMemoryContextForTurn({ identity: null, userText: "oi" });
		expect(r).toBeNull();
	});

	it("adapter NoopAdapter → null sem chamar loadContext", async () => {
		// Força MEMORY_ADAPTER=noop (Noop não persiste)
		vi.stubEnv("MEMORY_ADAPTER", "noop");
		const { resetMemoryAdapter } = await import("./index");
		resetMemoryAdapter();

		const identity: UserIdentity = {
			kind: "phone",
			value: "+5511987654321",
			namespace: "test-ns",
		};
		const r = await loadMemoryContextForTurn({ identity, userText: "oi" });
		expect(r).toBeNull();
		resetMemoryAdapter();
	});

	it("userText > 200 chars → archivalQuery truncada", async () => {
		const longText = "x".repeat(500);
		const loadContextSpy = vi.fn().mockResolvedValue({
			agentId: "a1",
			block: { schemaVersion: 1, objections: [], channels: [] },
			archivalHits: [],
			daysSinceLastInteraction: null,
		});

		// Reset modules pra que vi.doMock pegue antes do import do bridge
		vi.resetModules();
		vi.doMock("./index", () => ({
			getMemoryAdapter: () => ({
				loadContext: loadContextSpy,
				storeMemories: vi.fn(),
				searchArchival: vi.fn().mockResolvedValue([]),
				reconcileIdentity: vi.fn(),
				isPersistent: () => true,
			}),
			resetMemoryAdapter: () => {},
		}));

		const bridge = await import("./orchestrator-bridge");
		const identity: UserIdentity = {
			kind: "phone",
			value: "+5511987654321",
			namespace: "test-ns",
		};
		await bridge.loadMemoryContextForTurn({ identity, userText: longText });
		expect(loadContextSpy).toHaveBeenCalled();
		const call = loadContextSpy.mock.calls[0];
		expect(call[1].archivalQuery.length).toBe(200);

		vi.doUnmock("./index");
	});
});

describe("storeMemoriesForTurn", () => {
	it("identity null → resolve sem chamar adapter", async () => {
		await expect(
			storeMemoriesForTurn({
				identity: null,
				artifacts: [],
				meta: {} as ConversationMetadata,
				channel: "web",
				userText: "oi",
				conversationId: "conv-1",
			}),
		).resolves.toBeUndefined();
	});

	it("adapter Noop → resolve sem chamar storeMemories", async () => {
		vi.stubEnv("MEMORY_ADAPTER", "noop");
		const { resetMemoryAdapter } = await import("./index");
		resetMemoryAdapter();

		const identity: UserIdentity = {
			kind: "phone",
			value: "+5511987654321",
			namespace: "test-ns",
		};
		await expect(
			storeMemoriesForTurn({
				identity,
				artifacts: [],
				meta: {} as ConversationMetadata,
				channel: "web",
				userText: "oi",
				conversationId: "conv-1",
			}),
		).resolves.toBeUndefined();
		resetMemoryAdapter();
	});

	it("fluxo normal: extractor é chamado, adapter.storeMemories recebe extrações", async () => {
		const storeSpy = vi.fn().mockResolvedValue(undefined);

		vi.resetModules();
		vi.doMock("./index", () => ({
			getMemoryAdapter: () => ({
				loadContext: vi.fn().mockResolvedValue(null),
				storeMemories: storeSpy,
				searchArchival: vi.fn().mockResolvedValue([]),
				reconcileIdentity: vi.fn(),
				isPersistent: () => true,
			}),
			resetMemoryAdapter: () => {},
		}));

		const bridge = await import("./orchestrator-bridge");
		const identity: UserIdentity = {
			kind: "phone",
			value: "+5511987654321",
			namespace: "test-ns",
		};

		await bridge.storeMemoriesForTurn({
			identity,
			artifacts: [
				{
					type: "simulation_result",
					payload: { creditValue: 100000, termMonths: 60, monthlyPrice: 2000 },
				},
			],
			meta: { currentCategory: "auto" } as ConversationMetadata,
			channel: "web",
			userText: "simular",
			conversationId: "conv-1",
		});

		expect(storeSpy).toHaveBeenCalledTimes(1);
		const [calledIdentity, entries, metadata] = storeSpy.mock.calls[0];
		expect(calledIdentity).toEqual(identity);
		expect(entries.length).toBe(1);
		expect(entries[0].kind).toBe("simulation");
		expect(metadata.conversationId).toBe("conv-1");
		expect(metadata.channel).toBe("web");
		expect(metadata.blockPatch.category).toBe("auto");

		vi.doUnmock("./index");
	});

	it("adapter throw → promise resolves (engole erro)", async () => {
		vi.resetModules();
		vi.doMock("./index", () => ({
			getMemoryAdapter: () => ({
				loadContext: vi.fn().mockResolvedValue(null),
				storeMemories: vi.fn().mockRejectedValue(new Error("Letta down")),
				searchArchival: vi.fn().mockResolvedValue([]),
				reconcileIdentity: vi.fn(),
				isPersistent: () => true,
			}),
			resetMemoryAdapter: () => {},
		}));

		const bridge = await import("./orchestrator-bridge");
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const identity: UserIdentity = {
			kind: "phone",
			value: "+5511987654321",
			namespace: "test-ns",
		};

		await expect(
			bridge.storeMemoriesForTurn({
				identity,
				artifacts: [],
				meta: {} as ConversationMetadata,
				channel: "web",
				userText: "oi",
				conversationId: "conv-fail",
			}),
		).resolves.toBeUndefined();

		expect(warnSpy).toHaveBeenCalled();
		vi.doUnmock("./index");
	});
});
