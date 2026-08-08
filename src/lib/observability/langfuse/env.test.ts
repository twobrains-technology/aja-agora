// isLangfuseConfigured — a chave do no-op: sem as 3 envs (ou com elas VAZIAS,
// footgun `${VAR:-}` do compose), a observabilidade inteira desliga em silêncio.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isLangfuseConfigured } from "./env";

const KEYS = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
	saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
	for (const k of KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe("isLangfuseConfigured", () => {
	it("desligado quando nenhuma env existe", () => {
		expect(isLangfuseConfigured()).toBe(false);
	});

	it("desligado quando as envs existem mas estão VAZIAS (compose materializa VAR vazia)", () => {
		process.env.LANGFUSE_PUBLIC_KEY = "";
		process.env.LANGFUSE_SECRET_KEY = "";
		process.env.LANGFUSE_BASE_URL = "";
		expect(isLangfuseConfigured()).toBe(false);
	});

	it("desligado quando falta uma das três", () => {
		process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-x";
		process.env.LANGFUSE_SECRET_KEY = "sk-lf-x";
		expect(isLangfuseConfigured()).toBe(false);
	});

	it("ligado quando as três existem com valor", () => {
		process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-x";
		process.env.LANGFUSE_SECRET_KEY = "sk-lf-x";
		process.env.LANGFUSE_BASE_URL = "https://langfuse.example.com";
		expect(isLangfuseConfigured()).toBe(true);
	});

	it("whitespace puro conta como vazio", () => {
		process.env.LANGFUSE_PUBLIC_KEY = "  ";
		process.env.LANGFUSE_SECRET_KEY = "sk-lf-x";
		process.env.LANGFUSE_BASE_URL = "https://langfuse.example.com";
		expect(isLangfuseConfigured()).toBe(false);
	});
});
