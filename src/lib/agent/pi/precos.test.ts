import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	custoDoTurnoCents,
	custoDoTurnoCentsExatos,
	custoDoTurnoUsd,
	PRECO_USD_POR_MILHAO,
	precoDoModelo,
} from "./precos";

describe("o custo do turno é calculado do usage, e ausência de preço não é zero", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("turno real do modelo com preço cadastrado", () => {
		// 20.000 entrada × US$ 1/M = US$ 0,02; 6.000 saída × US$ 5/M = US$ 0,03 → 5 centavos.
		expect(
			custoDoTurnoCents({ modelo: "claude-haiku-4-5", tokensInput: 20000, tokensOutput: 6000 }),
		).toBe(5);
	});

	it("o sufixo de data do provedor não esconde o preço do modelo", () => {
		// Produção roda o id datado (`-20251001`); sem normalizar, o custo virava null.
		expect(precoDoModelo("claude-haiku-4-5-20251001")).toMatchObject({ entrada: 1, saida: 5 });
	});

	it("modelo sem preço cadastrado: NULL, não zero", () => {
		const r = custoDoTurnoCents({
			modelo: "modelo-de-teste-sem-preco",
			tokensInput: 30000,
			tokensOutput: 1500,
		});
		expect(r).toBeNull();
	});

	it("modelo sem preço é AVISADO no log, não engolido em silêncio", () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
		custoDoTurnoUsd({ modelo: "outro-modelo-sem-preco", tokensInput: 10, tokensOutput: 10 });
		custoDoTurnoUsd({ modelo: "outro-modelo-sem-preco", tokensInput: 10, tokensOutput: 10 });

		expect(aviso).toHaveBeenCalledTimes(1); // uma vez por modelo, não por beat
		expect(String(aviso.mock.calls[0]?.[0])).toContain("outro-modelo-sem-preco");
	});

	it("turno pequeno não vira custo inventado", () => {
		expect(custoDoTurnoCents({ modelo: "claude-haiku-4-5", tokensInput: 0, tokensOutput: 0 })).toBe(
			0,
		);
	});

	// O livro-caixa não pode voltar a gravar tokens sem custo calculável.
	it("o turno grava o custo calculado", () => {
		const fonte = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		// O custo sai do livro-caixa comum (`registrarUsoDeIa`), que calcula UMA vez
		// sobre os tokens somados dos beats — a mesma disciplina de N09/P217. As
		// duas formas antigas estão fora: o `INSERT` inline com
		// `custoUsdCents: custoDoTurnoCents(...)` (arredondava por beat e zerava o
		// consumo de modelo barato) e o `custoUsdCents: usoDoTurno.custoUsdCents`
		// (uma segunda conta do mesmo número, sem o cache do prompt).
		expect(fonte).toMatch(/registrarUsoDeIa\(\{/);
		expect(fonte).toMatch(/somarUsoDosBeats\(/);
	});

	it("o preço cadastrado é o que a conta da casa usa", () => {
		expect(PRECO_USD_POR_MILHAO["claude-haiku-4-5"]).toMatchObject({ entrada: 1, saida: 5 });
	});
});

describe("P217/P273 — o cache do prompt é custo, e entra na conta", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// Um beat real do turno: 12.000 tokens de prompt chegam como 1.500 de entrada,
	// 10.000 de leitura de cache e 500 de escrita (é o que o provedor reporta).
	const beatComCache = {
		modelo: "claude-haiku-4-5",
		tokensInput: 1_500,
		tokensOutput: 800,
		cacheRead: 10_000,
		cacheWrite: 500,
	};

	it("o custo do turno inclui leitura e escrita de cache, não só entrada e saída", () => {
		const comCache = custoDoTurnoCentsExatos(beatComCache);
		const semCache = custoDoTurnoCentsExatos({
			modelo: "claude-haiku-4-5",
			tokensInput: 1_500,
			tokensOutput: 800,
		});

		// Entrada 0,15 + saída 0,40 = 0,55 centavo; com o cache, +0,10 (lido) +0,0625 (escrito).
		expect(semCache).toBeCloseTo(0.55, 10);
		expect(comCache).toBeCloseTo(0.7125, 10);
	});

	it("modelo sem preço de cache: turno COM cache tem custo DESCONHECIDO, nunca a soma parcial", () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

		const r = custoDoTurnoCents({
			modelo: "qwen3.6-flash",
			tokensInput: 1_500,
			tokensOutput: 800,
			cacheRead: 10_000,
		});

		expect(r).toBeNull();
		expect(String(aviso.mock.calls[0]?.[0])).toContain("preço de CACHE");
	});

	it("o mesmo modelo, sem cache reportado, continua calculável", () => {
		// Sem cache o preço de cache não é gasto: 80 mil × US$ 0,05/M = 0,4 centavo.
		expect(
			custoDoTurnoCentsExatos({ modelo: "qwen3.6-flash", tokensInput: 80_000, tokensOutput: 0 }),
		).toBeCloseTo(0.4, 10);
	});
});

describe("P273 — cache NÃO MEDIDO é custo desconhecido; cache 0 é medido", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// A linha antiga do Pi gravou o input líquido e não gravou o cache: o provedor pode
	// ter cobrado leitura/escrita que ninguém mediu. Precificar só entrada e saída daria
	// a essa linha cara de medição — e o cache é a parcela maior de um turno que repete
	// a mesma caixa de prompt (P273).
	it("cache NULL (não medido) deixa o custo DESCONHECIDO, nunca a soma de entrada e saída", () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

		const r = custoDoTurnoCentsExatos({
			modelo: "qwen3.6-flash",
			tokensInput: 80_000,
			tokensOutput: 0,
			cacheRead: null,
			cacheWrite: null,
		});

		expect(r).toBeNull();
		expect(String(aviso.mock.calls[0]?.[0])).toContain("NÃO MEDIDO");
	});

	it("um lado medido e o outro não: o turno continua desconhecido", () => {
		const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

		const r = custoDoTurnoCents({
			modelo: "claude-haiku-4-5",
			tokensInput: 1_500,
			tokensOutput: 800,
			cacheRead: 10_000,
			cacheWrite: null,
		});

		expect(r).toBeNull();
		expect(aviso).toHaveBeenCalledTimes(1);
	});

	// O outro lado da mesma lei: o provedor reportou zero. Aí o preço integral é o preço.
	it("cache medido em ZERO é custo calculável — o período não vira PARCIAL à toa", () => {
		expect(
			custoDoTurnoCentsExatos({
				modelo: "qwen3.6-flash",
				tokensInput: 80_000,
				tokensOutput: 0,
				cacheRead: 0,
				cacheWrite: 0,
			}),
		).toBeCloseTo(0.4, 10);
	});
});

describe("L24 — a tabela de preço cobre o modelo default do vendedor", () => {
	it("o default de dev tem preço: o turno dele é calculável", () => {
		const r = custoDoTurnoUsd({ modelo: "qwen3.6-flash", tokensInput: 20000, tokensOutput: 6000 });
		expect(r).not.toBeNull();
		expect(r).toBeGreaterThan(0);
	});

	it("o modelo não é adivinhado: só quem está na tabela tem preço", () => {
		expect(precoDoModelo("qwen3.6-flash")).toEqual({ entrada: 0.05, saida: 0.4 });
	});
});

describe("L36 — o custo por beat é preservado antes da soma", () => {
	// Um beat do default do vendedor: 80.000 tokens de entrada × US$ 0,05/M = 0,4 centavo.
	const beatSubcentavo = { modelo: "qwen3.6-flash", tokensInput: 80000, tokensOutput: 0 };

	it("o valor exato mede o beat que o campo inteiro não consegue gravar", () => {
		expect(custoDoTurnoCentsExatos(beatSubcentavo)).toBeCloseTo(0.4, 10);
		expect(custoDoTurnoCents(beatSubcentavo)).toBe(0);
	});

	it("arredondar por beat zera a soma; somar os exatos recupera o centavo", () => {
		const tresBeats = [beatSubcentavo, beatSubcentavo, beatSubcentavo];

		const porBeat = tresBeats
			.map((beat) => custoDoTurnoCents(beat) ?? 0)
			.reduce((total, c) => total + c, 0);
		const exata = tresBeats
			.map((beat) => custoDoTurnoCentsExatos(beat) ?? 0)
			.reduce((total, c) => total + c, 0);

		expect(porBeat).toBe(0); // 0,4 + 0,4 + 0,4 virou 0 + 0 + 0
		expect(Math.round(exata)).toBe(1); // 1,2 centavo, arredondado só no fim
	});
});
