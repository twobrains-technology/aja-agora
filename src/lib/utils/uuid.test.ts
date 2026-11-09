import { afterEach, describe, expect, it, vi } from "vitest";

import { novoUuid } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("novoUuid", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("devolve um UUID v4 válido", () => {
		expect(novoUuid()).toMatch(V4);
	});

	it("não repete em 1000 chamadas", () => {
		expect(new Set(Array.from({ length: 1000 }, novoUuid)).size).toBe(1000);
	});

	it("cai para getRandomValues quando randomUUID é undefined", () => {
		const real = globalThis.crypto;
		const getRandomValues = vi.fn(<T extends ArrayBufferView>(a: T) => real.getRandomValues(a));
		vi.stubGlobal("crypto", { randomUUID: undefined, getRandomValues });
		const ids = Array.from({ length: 200 }, novoUuid);
		expect(getRandomValues).toHaveBeenCalledTimes(200);
		for (const id of ids) expect(id).toMatch(V4);
		expect(new Set(ids).size).toBe(200);
	});
});
