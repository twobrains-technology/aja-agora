// makeLangfuseCallbackHandler — undefined quando desligado; handler quando
// ligado; construção que lança ⇒ undefined (nunca propaga).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const handlerCtor = vi.fn();
vi.mock("@langfuse/langchain", () => ({
	CallbackHandler: class {
		constructor(...args: unknown[]) {
			handlerCtor(...args);
		}
	},
}));

import { makeLangfuseCallbackHandler } from "./langchain";

const KEYS = ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
	saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
	for (const k of KEYS) delete process.env[k];
	handlerCtor.mockReset();
});

afterEach(() => {
	for (const k of KEYS) {
		if (saved[k] === undefined) delete process.env[k];
		else process.env[k] = saved[k];
	}
});

describe("makeLangfuseCallbackHandler", () => {
	it("undefined quando desligado (spread condicional no graph.stream fica limpo)", () => {
		expect(makeLangfuseCallbackHandler()).toBeUndefined();
		expect(handlerCtor).not.toHaveBeenCalled();
	});

	it("instancia o CallbackHandler quando configurado", () => {
		process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-x";
		process.env.LANGFUSE_SECRET_KEY = "sk-lf-x";
		process.env.LANGFUSE_BASE_URL = "https://langfuse.example.com";
		expect(makeLangfuseCallbackHandler()).toBeDefined();
		expect(handlerCtor).toHaveBeenCalledTimes(1);
	});

	it("construtor lançando ⇒ undefined, sem propagar", () => {
		process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-x";
		process.env.LANGFUSE_SECRET_KEY = "sk-lf-x";
		process.env.LANGFUSE_BASE_URL = "https://langfuse.example.com";
		handlerCtor.mockImplementation(() => {
			throw new Error("boom");
		});
		expect(makeLangfuseCallbackHandler()).toBeUndefined();
	});
});
