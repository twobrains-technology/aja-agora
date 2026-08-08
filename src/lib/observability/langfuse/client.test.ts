// getLangfuseClient — singleton null-safe: sem envs ⇒ null (nunca lança).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetLangfuseClientForTests, getLangfuseClient } from "./client";

const KEYS = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
	saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) delete process.env[k];
	__resetLangfuseClientForTests();
});

afterEach(() => {
	for (const k of KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
	__resetLangfuseClientForTests();
});

describe("getLangfuseClient", () => {
	it("retorna null sem envs (no-op, nunca lança)", () => {
		expect(getLangfuseClient()).toBeNull();
	});

	it("retorna o MESMO client (singleton) quando configurado", () => {
		process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-x";
		process.env.LANGFUSE_SECRET_KEY = "sk-lf-x";
		process.env.LANGFUSE_BASE_URL = "https://langfuse.example.com";
		const a = getLangfuseClient();
		const b = getLangfuseClient();
		expect(a).not.toBeNull();
		expect(a).toBe(b);
	});
});
