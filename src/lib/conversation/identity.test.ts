import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptIdentity, encryptIdentity, isValidCpf, maskCpf } from "./identity";

// Chave de teste — 32 bytes em base64 (NUNCA usar em produção).
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("isValidCpf — dígitos verificadores", () => {
	it("aceita CPF válido (com e sem máscara)", () => {
		expect(isValidCpf("529.982.247-25")).toBe(true);
		expect(isValidCpf("52998224725")).toBe(true);
	});

	it("rejeita DV errado", () => {
		expect(isValidCpf("529.982.247-26")).toBe(false);
		expect(isValidCpf("12345678900")).toBe(false);
	});

	it("rejeita sequências repetidas (111.111.111-11)", () => {
		expect(isValidCpf("11111111111")).toBe(false);
		expect(isValidCpf("00000000000")).toBe(false);
	});

	it("rejeita tamanho errado e vazio", () => {
		expect(isValidCpf("5299822472")).toBe(false);
		expect(isValidCpf("")).toBe(false);
	});
});

describe("maskCpf — exibição segura", () => {
	it("mascara os 6 primeiros dígitos", () => {
		expect(maskCpf("52998224725")).toBe("***.***.247-25");
	});
});

describe("encryptIdentity/decryptIdentity — AES-256-GCM", () => {
	const prev = process.env.IDENTITY_ENC_KEY;
	beforeEach(() => {
		process.env.IDENTITY_ENC_KEY = TEST_KEY;
	});
	afterEach(() => {
		if (prev === undefined) delete process.env.IDENTITY_ENC_KEY;
		else process.env.IDENTITY_ENC_KEY = prev;
	});

	it("roundtrip cifra e decifra a identidade", () => {
		const blob = encryptIdentity({ cpf: "52998224725", celular: "62999887766" });
		expect(blob).not.toContain("52998224725");
		expect(blob).not.toContain("62999887766");
		expect(decryptIdentity(blob)).toEqual({ cpf: "52998224725", celular: "62999887766" });
	});

	it("blobs diferentes a cada cifra (IV aleatório)", () => {
		const a = encryptIdentity({ cpf: "52998224725", celular: "62999887766" });
		const b = encryptIdentity({ cpf: "52998224725", celular: "62999887766" });
		expect(a).not.toBe(b);
	});

	it("falha alto sem IDENTITY_ENC_KEY (sem fallback silencioso)", () => {
		delete process.env.IDENTITY_ENC_KEY;
		expect(() => encryptIdentity({ cpf: "52998224725", celular: "62999887766" })).toThrow(
			/IDENTITY_ENC_KEY/,
		);
	});

	it("detecta blob adulterado (GCM auth tag)", () => {
		const blob = encryptIdentity({ cpf: "52998224725", celular: "62999887766" });
		const tampered = `${blob.slice(0, -4)}AAAA`;
		expect(() => decryptIdentity(tampered)).toThrow();
	});
});
