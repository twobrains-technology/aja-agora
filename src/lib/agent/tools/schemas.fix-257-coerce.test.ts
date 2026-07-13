// FIX-257 (P1, veredito Fable r4 §P1 #1, 2026-07-10): "espiral de negação" —
// o LLM manda creditMin/creditMax/creditValue como STRING (ex.: "92902" em vez
// de 92902) porque extraiu o número de texto livre do usuário. Os schemas
// Zod estritos (`z.number()`) rejeitavam a chamada; o tool-call falhava ANTES
// de rodar `execute` (AI SDK v6 `parseToolCall` marca `invalid: true`), e o
// tool-io-log (sem resultado casado pelo toolCallId) registrava `output: null`
// — indistinguível de "a tool rodou e não achou nada". O agente concluía que a
// oferta EXIBIDA na tabela "não tem dado real confirmado" e negava 3× (BB,
// RODOBENS) o que o próprio usuário estava vendo na tela.
//
// Cura: `z.coerce.number()` nos inputs numéricos que a LLM preenche a partir
// de texto livre (creditMin/creditMax/creditValue) — aceita tanto "92902"
// quanto 92902, então o erro de TIPO deixa de existir pra esse caso (o mais
// comum). Entrada genuinamente não-numérica (ex.: "abc") ainda falha — Zod
// não tem como inventar um número dali; ver tool-io-log.fix-257 para o
// tratamento barulhento desse resíduo.
import { describe, expect, it } from "vitest";
import { searchGroupsInput, simulateQuotaInput } from "./schemas";

describe("FIX-257 — searchGroupsInput coage creditMin/creditMax string→number", () => {
	it("aceita creditMin/creditMax como STRING (o formato que a LLM manda ao extrair de texto)", () => {
		const parsed = searchGroupsInput.parse({
			category: "auto",
			creditMin: "72000",
			creditMax: "120000",
		});
		expect(parsed.creditMin).toBe(72000);
		expect(parsed.creditMax).toBe(120000);
	});

	it("continua aceitando number puro (não regride o caminho já correto)", () => {
		const parsed = searchGroupsInput.parse({ category: "auto", creditMin: 72000, creditMax: 120000 });
		expect(parsed.creditMin).toBe(72000);
		expect(parsed.creditMax).toBe(120000);
	});

	it("sem creditMin/creditMax (campos opcionais) segue válido", () => {
		const parsed = searchGroupsInput.parse({ category: "auto" });
		expect(parsed.creditMin).toBeUndefined();
		expect(parsed.creditMax).toBeUndefined();
	});

	it("string genuinamente não-numérica ainda FALHA (não inventa número)", () => {
		expect(() => searchGroupsInput.parse({ category: "auto", creditMax: "muito" })).toThrow();
	});
});

describe("FIX-257 — simulateQuotaInput coage creditValue string→number", () => {
	it("aceita creditValue como STRING '92902' (o caso real do veredito r4, grupo ITAU 92.902)", () => {
		const parsed = simulateQuotaInput.parse({ groupId: "6a0ca9c73e68cce9b61d30fd", creditValue: "92902" });
		expect(parsed.creditValue).toBe(92902);
	});

	it("continua aceitando number puro", () => {
		const parsed = simulateQuotaInput.parse({ groupId: "abc", creditValue: 92902 });
		expect(parsed.creditValue).toBe(92902);
	});

	it("string não-numérica ainda FALHA", () => {
		expect(() => simulateQuotaInput.parse({ groupId: "abc", creditValue: "abc" })).toThrow();
	});

	it("valor negativo (coagido) ainda FALHA — .positive() intacto", () => {
		expect(() => simulateQuotaInput.parse({ groupId: "abc", creditValue: "-100" })).toThrow();
	});
});
