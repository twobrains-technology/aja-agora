import { describe, expect, it } from "vitest";
import { hashEmail, hashPhone, montarFbc, normalizarEmail, normalizarTelefone } from "./hash";

describe("normalizarEmail", () => {
	it("apara espaço e baixa a caixa, como a Meta exige", () => {
		expect(normalizarEmail("  Cliente@Exemplo.COM  ")).toBe("cliente@exemplo.com");
	});

	it("devolve nulo pra vazio ou ausente", () => {
		expect(normalizarEmail(null)).toBeNull();
		expect(normalizarEmail("")).toBeNull();
		expect(normalizarEmail("   ")).toBeNull();
	});

	it("recusa o que nem parece e-mail — hash de lixo só piora o matching", () => {
		expect(normalizarEmail("sem-arroba")).toBeNull();
		expect(normalizarEmail("a@b")).toBeNull();
	});
});

describe("normalizarTelefone", () => {
	it("tira símbolos e mantém o código do país", () => {
		// Regra da Meta: só dígitos, com código de país, sem o "+".
		expect(normalizarTelefone("+55 (11) 98888-7777")).toBe("5511988887777");
	});

	it("assume Brasil quando o número vem sem código de país", () => {
		// Todo cliente desta operação é brasileiro; sem o 55 o match não acontece.
		expect(normalizarTelefone("11988887777")).toBe("5511988887777");
		expect(normalizarTelefone("(11) 3333-4444")).toBe("551133334444");
	});

	it("não duplica o código de país de quem já veio com ele", () => {
		expect(normalizarTelefone("5511988887777")).toBe("5511988887777");
	});

	it("devolve nulo pra número curto demais pra ser telefone", () => {
		expect(normalizarTelefone("1234")).toBeNull();
		expect(normalizarTelefone(null)).toBeNull();
		expect(normalizarTelefone("abc")).toBeNull();
	});

	it("recusa o telefone sintético do simulador", () => {
		expect(normalizarTelefone("SIM-8f1c9c7e")).toBeNull();
	});
});

describe("hashEmail e hashPhone", () => {
	it("gera SHA-256 em hexadecimal minúsculo", () => {
		const hash = hashEmail("cliente@exemplo.com");

		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("hasheia o valor NORMALIZADO — mesma pessoa, mesmo hash", () => {
		// Se a normalização não viesse antes do hash, "A@b.com" e "a@b.com"
		// virariam pessoas diferentes pro algoritmo e o match despencaria.
		expect(hashEmail("  Cliente@Exemplo.COM ")).toBe(hashEmail("cliente@exemplo.com"));
		expect(hashPhone("+55 (11) 98888-7777")).toBe(hashPhone("5511988887777"));
	});

	it("não hasheia o que não passou na normalização", () => {
		expect(hashEmail("sem-arroba")).toBeNull();
		expect(hashPhone("123")).toBeNull();
	});

	it("bate com o SHA-256 de referência", () => {
		// Âncora externa (calculada fora deste código): se a implementação trocar
		// de algoritmo, de codificação ou passar a hashear o valor errado, cai
		// aqui em vez de virar campanha sem match lá na Meta.
		expect(hashEmail("cliente@exemplo.com")).toBe(
			"ad2df71d41942d725885ffc3a9ca7b4b7227b4c324735678c9ee6eb972eb01bb",
		);
		expect(hashPhone("+55 (11) 98888-7777")).toBe(
			"fde042094c292fe26c1752aa7760e8090d8dbc01a0f464054c0da6b72d18e8ad",
		);
	});
});

describe("montarFbc", () => {
	it("monta o cookie de clique no formato fb.1.<ts>.<fbclid>", () => {
		expect(montarFbc("IwAR0abc", 1_770_000_000_000)).toBe("fb.1.1770000000000.IwAR0abc");
	});

	it("devolve nulo sem fbclid — inventar um clique falsearia a atribuição", () => {
		expect(montarFbc(null, 1_770_000_000_000)).toBeNull();
		expect(montarFbc("", 1_770_000_000_000)).toBeNull();
	});
});
