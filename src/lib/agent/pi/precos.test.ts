import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { custoDoTurnoCents, PRECO_USD_POR_MILHAO } from "./precos";

describe("o custo do turno é calculado do usage, e ausência de preço não é zero", () => {
	it("turno real do modelo com preço cadastrado", () => {
		// 20.000 entrada × US$ 1/M = US$ 0,02; 6.000 saída × US$ 5/M = US$ 0,03 → 5 centavos.
		expect(
			custoDoTurnoCents({ modelo: "claude-haiku-4-5", tokensInput: 20000, tokensOutput: 6000 }),
		).toBe(5);
	});

	it("modelo sem preço cadastrado: NULL, não zero", () => {
		const r = custoDoTurnoCents({
			modelo: "qwen3.6-flash",
			tokensInput: 30000,
			tokensOutput: 1500,
		});
		expect(r).toBeNull();
	});

	it("turno pequeno não vira custo inventado", () => {
		expect(custoDoTurnoCents({ modelo: "claude-haiku-4-5", tokensInput: 0, tokensOutput: 0 })).toBe(
			0,
		);
	});

	// O livro-caixa não pode voltar a gravar tokens sem custo calculável.
	it("o turno grava o custo calculado", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		expect(fonte).toMatch(/custoUsdCents: custoDoTurnoCents\(\{/);
	});

	it("o preço cadastrado é o que a conta da casa usa", () => {
		expect(PRECO_USD_POR_MILHAO["claude-haiku-4-5"]).toEqual({ entrada: 1, saida: 5 });
	});
});
