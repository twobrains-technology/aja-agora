// src/lib/memory/noop-adapter.test.ts
//
// Unit tests pra NoopMemoryAdapter. Plano §3.5.

import { describe, expect, it } from "vitest";

import { NoopMemoryAdapter } from "./noop-adapter";
import type { UserIdentity } from "./types";

const identity: UserIdentity = {
	kind: "phone",
	value: "+5511987654321",
	namespace: "test-ns",
};

describe("NoopMemoryAdapter", () => {
	const adapter = new NoopMemoryAdapter();

	it("isPersistent() === false", () => {
		expect(adapter.isPersistent()).toBe(false);
	});

	it("loadContext retorna null", async () => {
		expect(await adapter.loadContext(identity)).toBeNull();
	});

	it("storeMemories resolve sem throw (no-op)", async () => {
		await expect(
			adapter.storeMemories(identity, [], { conversationId: "conv-1", channel: "web" }),
		).resolves.toBeUndefined();
	});

	it("searchArchival retorna []", async () => {
		expect(await adapter.searchArchival(identity, "query")).toEqual([]);
	});

	it("searchArchival com limit retorna [] também", async () => {
		expect(await adapter.searchArchival(identity, "query", 10)).toEqual([]);
	});

	it("reconcileIdentity resolve sem throw", async () => {
		const other: UserIdentity = {
			kind: "anon-cookie",
			value: "a".repeat(32),
			namespace: "test-ns",
		};
		await expect(adapter.reconcileIdentity(other, identity)).resolves.toBeUndefined();
	});
});
