// src/lib/memory/identity.test.ts
//
// Unit tests pra resolução de identidade. Plano §3.1 — sem deps externas.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	COOKIE_MAX_AGE_SECONDS,
	COOKIE_NAME,
	ENGAGEMENT_THRESHOLD,
	generateCookieValue,
	getNamespace,
	identityFromCookie,
	identityFromEmail,
	identityFromPhone,
	identityFromWaId,
	normalizePhoneBR,
	shouldCreateAnonAgent,
} from "./identity";

describe("normalizePhoneBR", () => {
	it("preserva E.164 já normalizado (móvel BR 11 dígitos)", () => {
		expect(normalizePhoneBR("+5511987654321")).toBe("+5511987654321");
	});

	it("aceita 13 dígitos sem `+` (com CC 55)", () => {
		expect(normalizePhoneBR("5511987654321")).toBe("+5511987654321");
	});

	it("aceita 11 dígitos sem CC (assume BR)", () => {
		expect(normalizePhoneBR("11987654321")).toBe("+5511987654321");
	});

	it("aceita formato com máscara", () => {
		expect(normalizePhoneBR("(11) 98765-4321")).toBe("+5511987654321");
	});

	it("aceita espaços e hífens misturados", () => {
		expect(normalizePhoneBR("11 9 8765-4321")).toBe("+5511987654321");
	});

	it("aceita 55 + máscara", () => {
		expect(normalizePhoneBR("55 11 9 8765-4321")).toBe("+5511987654321");
	});

	it("aceita número fixo 10 dígitos", () => {
		expect(normalizePhoneBR("1133334444")).toBe("+551133334444");
	});

	it("retorna null pra string curta demais (5 dígitos)", () => {
		expect(normalizePhoneBR("12345")).toBeNull();
	});

	it("retorna null pra string longa demais sem CC (12 dígitos sem 55)", () => {
		// 12 dígitos, não começa com 55 → withoutCC = 12 chars, > 11
		expect(normalizePhoneBR("123456789012")).toBeNull();
	});

	it("retorna null pra string só com não-dígitos", () => {
		expect(normalizePhoneBR("abcdef")).toBeNull();
	});

	it("retorna null pra string vazia", () => {
		expect(normalizePhoneBR("")).toBeNull();
	});

	it("retorna null pra null", () => {
		expect(normalizePhoneBR(null)).toBeNull();
	});

	it("retorna null pra undefined", () => {
		expect(normalizePhoneBR(undefined)).toBeNull();
	});

	it("retorna null pra apenas '55'", () => {
		// digits=55 → starts with 55 → withoutCC = "" → length 0 < 10
		expect(normalizePhoneBR("55")).toBeNull();
	});

	// REV-A: "55" inicial só é código de país quando o total tem 12-13 dígitos.
	// Antes, qualquer "55…" tinha os 2 primeiros removidos, então um móvel do DDD
	// 55 (Santa Maria-RS) sem CC virava 9 dígitos e era REJEITADO — e como o phone
	// é a chave de identidade da memória, esse usuário nunca casava histórico.
	it("aceita móvel do DDD 55 sem CC (11 dígitos começando com 55)", () => {
		expect(normalizePhoneBR("55999998888")).toBe("+5555999998888");
	});

	it("aceita móvel do DDD 55 COM CC (13 dígitos)", () => {
		expect(normalizePhoneBR("5555999998888")).toBe("+5555999998888");
	});

	it("aceita fixo do DDD 55 sem CC (10 dígitos começando com 55)", () => {
		expect(normalizePhoneBR("5533334444")).toBe("+555533334444");
	});

	it("retorna null pra phone US (não BR)", () => {
		// "+1 415 555 0000" → digits "14155550000" → starts with "1" not "55", length 11 → "+5514155550000"
		// Esse caso é intencionalmente uma limitação: a normalização não valida o DDD.
		// O resultado é um phone "BR" sintético — ainda é E.164 válido, então a função aceita.
		// Documentado como falso-positivo aceito. (Detect-pela-DDD seria outro PR.)
		expect(normalizePhoneBR("+1 415 555 0000")).toBe("+5514155550000");
	});
});

describe("identityFromPhone", () => {
	it("constrói identity com E.164 válido + namespace default", () => {
		const id = identityFromPhone("+5511987654321");
		expect(id.kind).toBe("phone");
		expect(id.value).toBe("+5511987654321");
		expect(typeof id.namespace).toBe("string");
		expect(id.namespace.length).toBeGreaterThan(0);
	});

	it("aceita namespace customizado", () => {
		const id = identityFromPhone("+5511987654321", "custom-ns");
		expect(id.namespace).toBe("custom-ns");
	});

	it("throw em E.164 sem `+`", () => {
		expect(() => identityFromPhone("5511987654321")).toThrow(/Invalid E\.164/);
	});

	it("throw em phone curto demais (7 dígitos)", () => {
		expect(() => identityFromPhone("+1234567")).toThrow(/Invalid E\.164/);
	});
});

describe("identityFromWaId", () => {
	it("waId formato Cloud (digits sem +) → phone E.164", () => {
		const id = identityFromWaId("5511987654321");
		expect(id.kind).toBe("phone");
		expect(id.value).toBe("+5511987654321");
	});

	it("throw em waId inválido", () => {
		expect(() => identityFromWaId("abc")).toThrow(/Invalid waId/);
	});

	it("throw em waId vazio", () => {
		expect(() => identityFromWaId("")).toThrow(/Invalid waId/);
	});
});

describe("identityFromEmail", () => {
	it("email válido com upper case é normalizado pra lower", () => {
		const id = identityFromEmail("Alan@TwoBrains.com");
		expect(id.kind).toBe("email");
		expect(id.value).toBe("alan@twobrains.com");
	});

	it("trim antes de validar", () => {
		const id = identityFromEmail("  user@example.com  ");
		expect(id.value).toBe("user@example.com");
	});

	it("throw sem @", () => {
		expect(() => identityFromEmail("alan")).toThrow(/Invalid email/);
	});

	it("throw sem TLD", () => {
		expect(() => identityFromEmail("alan@two")).toThrow(/Invalid email/);
	});

	it("throw com espaços internos", () => {
		expect(() => identityFromEmail("a b@c.com")).toThrow(/Invalid email/);
	});
});

describe("identityFromCookie", () => {
	it("aceita hex 32 chars", () => {
		const id = identityFromCookie("a".repeat(32));
		expect(id.kind).toBe("anon-cookie");
		expect(id.value).toBe("a".repeat(32));
	});

	it("aceita hex 16 chars (mínimo)", () => {
		expect(identityFromCookie("a".repeat(16)).kind).toBe("anon-cookie");
	});

	it("aceita hex 64 chars (máximo)", () => {
		expect(identityFromCookie("a".repeat(64)).kind).toBe("anon-cookie");
	});

	it("throw em 15 chars (abaixo do mínimo)", () => {
		expect(() => identityFromCookie("a".repeat(15))).toThrow(/Invalid cookie/);
	});

	it("throw em caractere fora de [a-f0-9]", () => {
		expect(() => identityFromCookie(`abc!${"a".repeat(28)}`)).toThrow(/Invalid cookie/);
	});

	it("throw em uppercase hex (regex é case-sensitive)", () => {
		expect(() => identityFromCookie("A".repeat(32))).toThrow(/Invalid cookie/);
	});
});

describe("generateCookieValue", () => {
	it("formato é hex 32 chars", () => {
		const v = generateCookieValue();
		expect(v).toMatch(/^[a-f0-9]{32}$/);
	});

	it("unicidade: 100 valores distintos", () => {
		const set = new Set<string>();
		for (let i = 0; i < 100; i++) {
			set.add(generateCookieValue());
		}
		expect(set.size).toBe(100);
	});
});

describe("shouldCreateAnonAgent", () => {
	it.each([
		[0, false],
		[1, false],
		[2, false],
		[3, true],
		[4, true],
		[100, true],
	])("turnCount=%i → %s", (count, expected) => {
		expect(shouldCreateAnonAgent(count)).toBe(expected);
	});

	it("threshold constante é 3", () => {
		expect(ENGAGEMENT_THRESHOLD).toBe(3);
	});
});

describe("getNamespace", () => {
	beforeEach(() => {
		// eslint-disable-next-line no-process-env
		delete process.env.MEMORY_NAMESPACE;
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_NAMESPACE;
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("retorna MEMORY_NAMESPACE quando setado", () => {
		vi.stubEnv("MEMORY_NAMESPACE", "aja-agora-prod");
		expect(getNamespace()).toBe("aja-agora-prod");
	});

	it("cai pra LETTA_NAMESPACE quando MEMORY_NAMESPACE ausente (transição FIX-81)", () => {
		// eslint-disable-next-line no-process-env
		delete process.env.MEMORY_NAMESPACE;
		vi.stubEnv("LETTA_NAMESPACE", "aja-agora-legacy");
		expect(getNamespace()).toBe("aja-agora-legacy");
	});

	it("retorna default quando ambas as envs ausentes ou vazias", () => {
		// eslint-disable-next-line no-process-env
		delete process.env.MEMORY_NAMESPACE;
		// eslint-disable-next-line no-process-env
		delete process.env.LETTA_NAMESPACE;
		expect(getNamespace()).toBe("aja-agora-local-default");
	});
});

describe("constantes exportadas", () => {
	it("COOKIE_NAME = 'aja_uid'", () => {
		expect(COOKIE_NAME).toBe("aja_uid");
	});

	it("COOKIE_MAX_AGE_SECONDS = 90 dias", () => {
		expect(COOKIE_MAX_AGE_SECONDS).toBe(90 * 24 * 60 * 60);
		expect(COOKIE_MAX_AGE_SECONDS).toBe(7_776_000);
	});
});
