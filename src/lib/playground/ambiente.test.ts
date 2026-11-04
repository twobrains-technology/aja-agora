import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlaygroundEnabled } from "./ambiente";

afterEach(() => vi.unstubAllEnvs());

describe("isPlaygroundEnabled", () => {
	it.each(["dev", "local", "DEV", " local "])("habilita com TB_ENV=%s", (v) => {
		vi.stubEnv("TB_ENV", v);
		expect(isPlaygroundEnabled()).toBe(true);
	});
	it.each(["prod", "production", "staging", "", "homolog"])("bloqueia com TB_ENV=%j", (v) => {
		vi.stubEnv("TB_ENV", v);
		expect(isPlaygroundEnabled()).toBe(false);
	});
	it("ausente = falso", () => {
		vi.stubEnv("TB_ENV", undefined as unknown as string);
		delete process.env.TB_ENV;
		expect(isPlaygroundEnabled()).toBe(false);
	});
	it("SIMULATOR_FORCE_ENABLE não habilita", () => {
		vi.stubEnv("TB_ENV", "prod");
		vi.stubEnv("SIMULATOR_FORCE_ENABLE", "1");
		expect(isPlaygroundEnabled()).toBe(false);
		delete process.env.TB_ENV;
		expect(isPlaygroundEnabled()).toBe(false);
	});
});
