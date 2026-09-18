// A meta do primeiro degrau e a régua de "Quem chegou" — funções puras.
//
// O que se prova aqui é o que a tela promete: o marcador de meta é LIDO com
// palavra (nunca só cor), e a faixa de valor não joga o valor exato do degrau
// em duas barras ao mesmo tempo.

import { describe, expect, it } from "vitest";
import {
	META_INICIO_DE_CONVERSA,
	posicaoDaMeta,
	rotuloDaMeta,
	TEXTO_DA_META,
} from "./meta-de-funil";
import {
	BENS_NA_ORDEM,
	bemDaChave,
	FAIXAS_DE_VALOR,
	faixaDeValor,
	ROTULO_DO_BEM,
	ROTULO_SEM_VALOR,
	rotuloDaFaixa,
} from "./quem-chegou";

describe("a meta de 4% do primeiro degrau", () => {
	it("é 4%, e é um nome só", () => {
		expect(META_INICIO_DE_CONVERSA).toBe(0.04);
		expect(TEXTO_DA_META).toContain("4%");
		expect(TEXTO_DA_META).toContain("15/09");
	});

	it("diz ACIMA e ABAIXO com palavra, não com cor", () => {
		expect(rotuloDaMeta(25)).toBe("acima da meta");
		expect(rotuloDaMeta(2.9)).toBe("abaixo da meta");
		expect(rotuloDaMeta(4)).toBe("na meta");
	});

	it("arredonda como a tela exibe — 3,96% aparece como 4,0% e não é 'abaixo'", () => {
		expect(posicaoDaMeta(3.96)).toBe("na_meta");
		expect(posicaoDaMeta(3.9)).toBe("abaixo");
		expect(posicaoDaMeta(4.04)).toBe("na_meta");
		expect(posicaoDaMeta(4.1)).toBe("acima");
	});
});

describe("o dicionário do bem", () => {
	it("usa Carro · Moto · Imóvel, com a chave técnica do funil", () => {
		expect(ROTULO_DO_BEM).toMatchObject({ auto: "Carro", moto: "Moto", imovel: "Imóvel" });
		// A casa única do dicionário é `src/lib/admin/rotulo-do-bem.ts` (merge do
		// F1 com o F3): as duas grafias do banco apontam para o mesmo rótulo.
		expect(ROTULO_DO_BEM.carro).toBe("Carro");
		expect(ROTULO_DO_BEM.automovel).toBe("Carro");
		expect(BENS_NA_ORDEM).toEqual(["auto", "imovel", "moto"]);
	});

	it("não inventa bem para chave desconhecida ou ausente", () => {
		expect(bemDaChave("auto")).toBe("auto");
		expect(bemDaChave("servicos")).toBeNull();
		expect(bemDaChave(undefined)).toBeNull();
		expect(bemDaChave(7)).toBeNull();
	});
});

describe("a faixa de valor", () => {
	it("põe o valor exato do degrau numa faixa só", () => {
		expect(faixaDeValor(50_000)).toBe("ate_50");
		expect(faixaDeValor(50_001)).toBe("de_50_a_100");
		expect(faixaDeValor(100_000)).toBe("de_50_a_100");
		expect(faixaDeValor(200_000)).toBe("de_100_a_200");
		expect(faixaDeValor(500_000)).toBe("de_200_a_500");
		expect(faixaDeValor(500_001)).toBe("acima_500");
	});

	it("cobre as três categorias até o teto que o funil aceita", () => {
		// moto vai até 80k, auto até 500k, imóvel até 2M (CREDIT_BOUNDS).
		expect(faixaDeValor(25_000)).toBe("ate_50");
		expect(faixaDeValor(80_000)).toBe("de_50_a_100");
		expect(faixaDeValor(2_000_000)).toBe("acima_500");
	});

	it("sem valor informado é ausência, não zero", () => {
		expect(faixaDeValor(null)).toBeNull();
		expect(faixaDeValor(undefined)).toBeNull();
		expect(faixaDeValor(0)).toBeNull();
		expect(faixaDeValor(Number.NaN)).toBeNull();
		expect(rotuloDaFaixa("ate_50")).toBe(FAIXAS_DE_VALOR[0].rotulo);
		expect(ROTULO_SEM_VALOR).toBe("Valor não informado");
	});
});
