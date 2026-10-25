import { and, eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { caixaDePrompt } from "@/db/schema";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import {
	caixaDoCodigo,
	decidirCaixa,
	escolherLinha,
	labelDaCaixa,
	lerCaixa,
	limparCacheDaCaixa,
	listarVersoes,
	NOME_DA_CAIXA,
	publicarCaixa,
} from "./caixa";

afterEach(() => limparCacheDaCaixa());

describe("caixa — a versão publicada governa", () => {
	it("a MAIOR versão vence, independente da ordem em que veio", () => {
		const caixa = decidirCaixa(
			[
				{ versao: 3, texto: "terceira" },
				{ versao: 11, texto: "decima primeira" },
				{ versao: 7, texto: "setima" },
			],
			"production",
		);
		expect(caixa.texto).toBe("decima primeira");
		expect(caixa.versao).toBe(11);
		expect(caixa.origem).toBe("banco");
	});

	it("versão publicada EM BRANCO não governa — volta para a maior válida", () => {
		const caixa = decidirCaixa([
			{ versao: 4, texto: "conduta boa" },
			{ versao: 5, texto: "   " },
		]);
		expect(caixa.versao).toBe(4);
		expect(caixa.texto).toBe("conduta boa");
	});

	it("sem nenhuma versão, a caixa é o texto do código (turno nunca fica sem conduta)", () => {
		expect(escolherLinha([])).toBeNull();
		const caixa = decidirCaixa([]);
		expect(caixa.origem).toBe("codigo");
		expect(caixa.versao).toBe(0);
		expect(caixa.texto).toBe(SYSTEM_PROMPT);
	});

	it("a label é por ambiente: CAIXA_LABEL manda e o default é production", () => {
		expect(labelDaCaixa({} as NodeJS.ProcessEnv)).toBe("production");
		expect(labelDaCaixa({ CAIXA_LABEL: "dev" } as unknown as NodeJS.ProcessEnv)).toBe("dev");
		expect(caixaDoCodigo("dev").label).toBe("dev");
	});
});

describe("caixa — a leitura não derruba o turno", () => {
	it("banco fora do ar devolve o texto do código", async () => {
		const caixa = await lerCaixa({
			buscarLinhas: async () => {
				throw new Error("connect ECONNREFUSED");
			},
		});
		expect(caixa.origem).toBe("codigo");
		expect(caixa.texto).toBe(SYSTEM_PROMPT);
	});

	it("lê a label pedida e respeita o cache por label", async () => {
		const chamadas: string[] = [];
		const buscarLinhas = async (_nome: string, label: string) => {
			chamadas.push(label);
			return label === "dev"
				? [{ versao: 2, texto: "conduta de dev" }]
				: [{ versao: 9, texto: "conduta de producao" }];
		};

		const prod = await lerCaixa({ label: "production", buscarLinhas });
		expect(prod.texto).toBe("conduta de producao");

		// mesmo label de novo: sem nova ida ao banco (o cache é do label corrente)
		await lerCaixa({ label: "production", buscarLinhas });
		expect(chamadas).toEqual(["production"]);

		// trocar de label relê — cada ambiente lê a SUA versão, nunca a do vizinho
		const dev = await lerCaixa({ label: "dev", buscarLinhas });
		expect(dev.texto).toBe("conduta de dev");
		expect(dev.label).toBe("dev");
		expect(chamadas).toEqual(["production", "dev"]);
	});
});

describe("caixa — o histórico da label", () => {
	it("devolve da MAIOR versão para a menor, mesmo que o banco venha fora de ordem", async () => {
		const versoes = await listarVersoes(NOME_DA_CAIXA, "production", {
			buscarLinhas: async () => [
				{ versao: 2, texto: "segunda", publicadoPor: "bruna@aja.com", criadoEm: new Date(2) },
				{ versao: 9, texto: "nona", publicadoPor: null, criadoEm: new Date(9) },
				{ versao: 5, texto: "quinta", publicadoPor: "kairo@aja.com", criadoEm: new Date(5) },
			],
		});

		expect(versoes.map((v) => v.versao)).toEqual([9, 5, 2]);
		expect(versoes[0].publicadoPor).toBeNull();
		expect(versoes[1].texto).toBe("quinta");
	});

	it("publicar duas versões cria histórico, com autor e data — e nada é editado", async () => {
		// Label isolada: o teste NUNCA escreve na label de produção do ambiente.
		const label = `teste-b1-${crypto.randomUUID()}`;
		try {
			await publicarCaixa({ texto: "primeira conduta", label, publicadoPor: "bruna@aja.com" });
			const segunda = await publicarCaixa({
				texto: "segunda conduta",
				label,
				publicadoPor: "kairo@aja.com",
			});
			expect(segunda.versao).toBe(2);

			const versoes = await listarVersoes(NOME_DA_CAIXA, label);
			expect(versoes.map((v) => v.versao)).toEqual([2, 1]);
			expect(versoes[0].texto).toBe("segunda conduta");
			expect(versoes[0].publicadoPor).toBe("kairo@aja.com");
			expect(versoes[0].criadoEm).toBeInstanceOf(Date);
			// A versão 1 continua lá, intacta: publicar é criar, nunca sobrescrever.
			expect(versoes[1].texto).toBe("primeira conduta");
		} finally {
			await db
				.delete(caixaDePrompt)
				.where(and(eq(caixaDePrompt.nome, NOME_DA_CAIXA), eq(caixaDePrompt.label, label)));
			limparCacheDaCaixa();
		}
	});
});

describe("caixa — publicar duas vezes ao mesmo tempo não é 500", () => {
	it("dois POST simultâneos viram duas versões distintas, sem lançar", async () => {
		// Label isolada: o teste NUNCA escreve na label de produção do ambiente.
		const label = `teste-b3-${crypto.randomUUID()}`;
		try {
			// Aquece 4 conexões ociosas: sem isto o pool pode serializar as duas
			// publicações na MESMA conexão e a corrida não acontece.
			await Promise.all([1, 2, 3, 4].map(() => db.execute(sql`select 1`)));
			const [uma, outra] = await Promise.all([
				publicarCaixa({ texto: "conduta da primeira aba", label, publicadoPor: "bruna@aja.com" }),
				publicarCaixa({ texto: "conduta da segunda aba", label, publicadoPor: "bruna@aja.com" }),
			]);

			// A mesma versão para os dois era o defeito: o segundo estourava no índice
			// único `(nome, label, versao)` e a tela recebia 500.
			expect([uma.versao, outra.versao].sort((a, b) => a - b)).toEqual([1, 2]);

			const versoes = await listarVersoes(NOME_DA_CAIXA, label);
			expect(versoes.map((v) => v.versao)).toEqual([2, 1]);
		} finally {
			await db
				.delete(caixaDePrompt)
				.where(and(eq(caixaDePrompt.nome, NOME_DA_CAIXA), eq(caixaDePrompt.label, label)));
			limparCacheDaCaixa();
		}
	});
});

describe("caixa — a leitura administrativa não aceita texto velho", () => {
	it("`semCache` vê a versão nova na hora; a do turno continua com o texto anterior", async () => {
		// Label isolada: o teste NUNCA escreve na label de produção do ambiente.
		const label = `teste-b3-${crypto.randomUUID()}`;
		try {
			await publicarCaixa({ texto: "primeira conduta", label });
			const daTela = await lerCaixa({ label, semCache: true });
			expect(daTela.versao).toBe(1);
			expect(daTela.origem).toBe("banco");

			// O TURNO lê e guarda por 60 s — é o cache que economiza o banco no turno.
			expect((await lerCaixa({ label })).versao).toBe(1);

			// Outra instância publica a v2: `limparCacheDaCaixa()` só roda em quem
			// publicou, então ESTE processo continua com a v1 em cache. É o cenário
			// real de dois servidores — aqui reproduzido com o insert direto.
			await db
				.insert(caixaDePrompt)
				.values({ nome: NOME_DA_CAIXA, label, versao: 2, texto: "segunda conduta" });

			// O turno pode esperar até 60 s...
			expect((await lerCaixa({ label })).versao).toBe(1);
			// ...a tela, não: ela relê o que está no ar para não sobrescrever o texto
			// recém-publicado com o velho.
			const relida = await lerCaixa({ label, semCache: true });
			expect(relida.versao).toBe(2);
			expect(relida.texto).toBe("segunda conduta");
		} finally {
			await db
				.delete(caixaDePrompt)
				.where(and(eq(caixaDePrompt.nome, NOME_DA_CAIXA), eq(caixaDePrompt.label, label)));
			limparCacheDaCaixa();
		}
	});

	it("`semCache` também NÃO grava o cache — o turno segue com o que ele mesmo leu", async () => {
		const chamadas: string[] = [];
		const buscarLinhas = async () => {
			chamadas.push("leitura");
			return [{ versao: 4, texto: "conduta do banco" }];
		};

		await lerCaixa({ label: "production", buscarLinhas, semCache: true });
		// A leitura administrativa não aqueceu o cache: a próxima do turno vai ao banco.
		await lerCaixa({ label: "production", buscarLinhas });
		expect(chamadas).toEqual(["leitura", "leitura"]);

		// E a do turno aqueceu: a seguinte não vai.
		await lerCaixa({ label: "production", buscarLinhas });
		expect(chamadas).toEqual(["leitura", "leitura"]);
	});
});
