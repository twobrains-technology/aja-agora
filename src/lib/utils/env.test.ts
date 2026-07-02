// Bug B-01 (QA simulador final): guard NODE_ENV=production bloqueia em
// LOCAL e DEV (Next standalone roda production sempre). Helper centraliza
// a decisão "simulador habilitado" via TB_ENV explícito.
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSimulatorEnabled } from "./env";

describe("isSimulatorEnabled (Bug B-01)", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("habilitado em LOCAL (TB_ENV=local)", () => {
		vi.stubEnv("TB_ENV", "local");
		vi.stubEnv("NODE_ENV", "production");
		expect(isSimulatorEnabled()).toBe(true);
	});

	it("habilitado em DEV (TB_ENV=dev)", () => {
		vi.stubEnv("TB_ENV", "dev");
		vi.stubEnv("NODE_ENV", "production");
		expect(isSimulatorEnabled()).toBe(true);
	});

	it("habilitado quando TB_ENV não setado (DEV/staging genérico)", () => {
		vi.stubEnv("TB_ENV", "");
		vi.stubEnv("NODE_ENV", "production");
		expect(isSimulatorEnabled()).toBe(true);
	});

	it("habilitado em desenvolvimento padrão (NODE_ENV=development)", () => {
		vi.stubEnv("TB_ENV", "");
		vi.stubEnv("NODE_ENV", "development");
		expect(isSimulatorEnabled()).toBe(true);
	});

	it("BLOQUEADO em PROD (TB_ENV=production explícito)", () => {
		vi.stubEnv("TB_ENV", "production");
		vi.stubEnv("NODE_ENV", "production");
		expect(isSimulatorEnabled()).toBe(false);
	});

	it("BLOQUEADO em PROD (TB_ENV=prod abreviado)", () => {
		vi.stubEnv("TB_ENV", "prod");
		vi.stubEnv("NODE_ENV", "production");
		expect(isSimulatorEnabled()).toBe(false);
	});

	it("case-insensitive (TB_ENV=PROD funciona)", () => {
		vi.stubEnv("TB_ENV", "PROD");
		vi.stubEnv("NODE_ENV", "production");
		expect(isSimulatorEnabled()).toBe(false);
	});

	// Override QA (auto-whatsapp): escape hatch estreito pra habilitar o
	// simulador em PROD sob demanda, SEM flipar TB_ENV (que degradaria OTP em
	// recovery.ts:116 e o rate-limit). Afeta APENAS isSimulatorEnabled().
	describe("SIMULATOR_FORCE_ENABLE (override QA em prod)", () => {
		it("habilita em PROD quando SIMULATOR_FORCE_ENABLE=true", () => {
			vi.stubEnv("TB_ENV", "production");
			vi.stubEnv("NODE_ENV", "production");
			vi.stubEnv("SIMULATOR_FORCE_ENABLE", "true");
			expect(isSimulatorEnabled()).toBe(true);
		});

		it("aceita '1' como truthy", () => {
			vi.stubEnv("TB_ENV", "prod");
			vi.stubEnv("SIMULATOR_FORCE_ENABLE", "1");
			expect(isSimulatorEnabled()).toBe(true);
		});

		it("segue BLOQUEADO em PROD com override ausente", () => {
			vi.stubEnv("TB_ENV", "production");
			vi.stubEnv("SIMULATOR_FORCE_ENABLE", "");
			expect(isSimulatorEnabled()).toBe(false);
		});

		it("segue BLOQUEADO em PROD com override falsy (false)", () => {
			vi.stubEnv("TB_ENV", "production");
			vi.stubEnv("SIMULATOR_FORCE_ENABLE", "false");
			expect(isSimulatorEnabled()).toBe(false);
		});
	});
});
