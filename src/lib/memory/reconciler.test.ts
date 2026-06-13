// src/lib/memory/reconciler.test.ts
//
// Unit tests pra reconciler. Plano §3.8 — mocking adapter.

import { describe, expect, it, vi } from "vitest";

import type { MemoryAdapter } from "./adapter";
import { reconcileIdentity } from "./reconciler";
import type { UserIdentity } from "./types";

function makeAdapter(over: Partial<MemoryAdapter> = {}): MemoryAdapter {
	return {
		loadContext: vi.fn().mockResolvedValue(null),
		storeMemories: vi.fn().mockResolvedValue(undefined),
		searchArchival: vi.fn().mockResolvedValue([]),
		reconcileIdentity: vi.fn().mockResolvedValue(undefined),
		purgeIdentity: vi.fn().mockResolvedValue(undefined),
		isPersistent: () => true,
		...over,
	};
}

const cookieId: UserIdentity = {
	kind: "anon-cookie",
	value: "a".repeat(32),
	namespace: "test-ns",
};

const phoneId: UserIdentity = {
	kind: "phone",
	value: "+5511987654321",
	namespace: "test-ns",
};

describe("reconcileIdentity", () => {
	it("adapter resolve ok → success=true, durationMs >= 0, adapter chamado 1x", async () => {
		const adapter = makeAdapter();
		const r = await reconcileIdentity({
			adapter,
			from: cookieId,
			to: phoneId,
			conversationId: "conv-1",
		});
		expect(r.success).toBe(true);
		expect(r.durationMs).toBeGreaterThanOrEqual(0);
		expect(r.error).toBeUndefined();
		expect(adapter.reconcileIdentity).toHaveBeenCalledTimes(1);
		expect(adapter.reconcileIdentity).toHaveBeenCalledWith(cookieId, phoneId);
	});

	it("adapter throw → success=false, error populado, NÃO rejeita", async () => {
		const adapter = makeAdapter({
			reconcileIdentity: vi.fn().mockRejectedValue(new Error("Letta exploded")),
		});
		const r = await reconcileIdentity({
			adapter,
			from: cookieId,
			to: phoneId,
			conversationId: "conv-1",
		});
		expect(r.success).toBe(false);
		expect(r.error).toBe("Letta exploded");
	});

	it("identidades iguais (mesmo kind+value) → success=true, durationMs=0, adapter NÃO chamado", async () => {
		const adapter = makeAdapter();
		const r = await reconcileIdentity({
			adapter,
			from: cookieId,
			to: cookieId,
			conversationId: "conv-noop",
		});
		expect(r.success).toBe(true);
		expect(r.durationMs).toBe(0);
		expect(adapter.reconcileIdentity).not.toHaveBeenCalled();
	});

	it("durationMs calculado (adapter sleep 30ms)", async () => {
		const adapter = makeAdapter({
			reconcileIdentity: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 30))),
		});
		const r = await reconcileIdentity({
			adapter,
			from: cookieId,
			to: phoneId,
			conversationId: "conv-time",
		});
		expect(r.durationMs).toBeGreaterThanOrEqual(20);
	});

	it("erro não-Error (string) → captura via String()", async () => {
		const adapter = makeAdapter({
			reconcileIdentity: vi.fn().mockRejectedValue("plain string error"),
		});
		const r = await reconcileIdentity({
			adapter,
			from: cookieId,
			to: phoneId,
			conversationId: "conv-x",
		});
		expect(r.success).toBe(false);
		expect(r.error).toContain("plain string error");
	});
});
