import { describe, expect, it, vi } from "vitest";
import { JUDGE_MODEL } from "@/lib/eval/judge";
import {
	computeCustoDeIA,
	linhasDoLivroLocal,
	somarCustoDeIA,
	type UsoDeIaGravado,
} from "./custo-de-ia";

const CONVERSA = "11111111-1111-1111-1111-111111111111";

/** Um beat do default do vendedor: 80.000 tokens de entrada × US$ 0,05/M = 0,4 centavo. */
function beatDoVendedor(over: Partial<UsoDeIaGravado> = {}): UsoDeIaGravado {
	return {
		conversationId: CONVERSA,
		modelo: "qwen3.6-flash",
		tokensInput: 80000,
		tokensOutput: 0,
		tokensCacheRead: null,
		tokensCacheWrite: null,
		criadoEm: new Date("2026-10-20T15:00:00Z"),
		...over,
	};
}

describe("L36 — o custo da tela soma os valores exatos, arredondando só no fim", () => {
	it("três beats subcentavo deixam de somar zero", () => {
		const linhas = linhasDoLivroLocal([beatDoVendedor(), beatDoVendedor(), beatDoVendedor()]);

		for (const linha of linhas) {
			expect(linha.custoUsdCents).toBeCloseTo(0.4, 10);
		}

		const r = somarCustoDeIA({
			linhas,
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		// 0,4 + 0,4 + 0,4 = 1,2 centavo de dólar — o arredondamento por beat dava 0.
		expect(r.usdCents).toBeCloseTo(1.2, 10);
		expect(r.brlCents).toBe(7); // 1,2 × 5,5 = 6,6 → arredonda na exibição
	});

	it("o agrupado por modelo também carrega o valor exato", () => {
		const linhas = linhasDoLivroLocal([beatDoVendedor(), beatDoVendedor()]);
		const r = somarCustoDeIA({
			linhas,
			conversas: [{ conversationId: CONVERSA, canal: "whatsapp" }],
			cotacaoUsdBrl: 1,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		expect(r.porModelo).toHaveLength(1);
		expect(r.porModelo[0]?.chave).toBe("qwen3.6-flash");
		expect(r.porModelo[0]?.usdCents).toBeCloseTo(0.8, 10);
	});

	it("custo fracionário com cotação ausente é `sem_cotacao`, não R$ 0,00", () => {
		const linhas = linhasDoLivroLocal([beatDoVendedor()]);
		const r = somarCustoDeIA({
			linhas,
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: null,
		});

		expect(r.tipo).toBe("motivo");
		if (r.tipo !== "motivo") return;
		expect(r.motivo).toBe("sem_cotacao");
	});
});

describe("L24 — modelo sem preço continua nomeado, nunca custo 0, e não apaga o período", () => {
	it("uma linha sem preço ao lado de uma calculável: total PARCIAL, com a contagem por modelo", () => {
		const linhas = linhasDoLivroLocal([
			beatDoVendedor(),
			beatDoVendedor({ modelo: "modelo-sem-preco-de-teste" }),
		]);

		// A linha sem preço continua `null` — desconhecido, nunca zero.
		expect(linhas[1]?.custoUsdCents).toBeNull();

		const r = somarCustoDeIA({
			linhas,
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		// O total é a soma do que se CONHECE: 0,4 centavo do beat calculável.
		expect(r.usdCents).toBeCloseTo(0.4, 10);
		expect(r.parcial).toBe(true);
		expect(r.semPreco).toEqual([{ modelo: "modelo-sem-preco-de-teste", linhas: 1 }]);
		// A linha sem preço não pode entrar como custo 0 no agrupado por modelo.
		expect(r.porModelo.map((m) => m.chave)).toEqual(["qwen3.6-flash"]);
	});

	it("todas as linhas sem preço: não há total nenhum, e os modelos são nomeados", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([
				beatDoVendedor({ modelo: "modelo-sem-preco-de-teste" }),
				beatDoVendedor({ modelo: "outro-modelo-sem-preco" }),
			]),
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("motivo");
		if (r.tipo !== "motivo") return;
		expect(r.motivo).toBe("modelo_sem_preco");
		expect(r.modelosSemPreco).toEqual(["modelo-sem-preco-de-teste", "outro-modelo-sem-preco"]);
	});

	it("o modelo do juiz e do diagnóstico, sem preço cadastrado, deixa o período PARCIAL", () => {
		// É o caso real: `JUDGE_MODEL`/`DIAGNOSIS_MODEL` gravam linha em `uso_de_ia` a cada
		// avaliação. Uma delas no dia não pode custar o custo do dia inteiro.
		const linhas = linhasDoLivroLocal([
			beatDoVendedor(),
			beatDoVendedor({ modelo: JUDGE_MODEL, tokensInput: 120_000, tokensOutput: 20_000 }),
		]);

		const r = somarCustoDeIA({
			linhas,
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		expect(r.parcial).toBe(true);
		expect(r.semPreco).toEqual([{ modelo: JUDGE_MODEL, linhas: 1 }]);
		expect(r.usdCents).toBeCloseTo(0.4, 10); // só a linha do vendedor tem preço
	});

	it("período inteiro calculável não é marcado como parcial", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([beatDoVendedor()]),
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		expect(r.parcial).toBe(false);
		expect(r.semPreco).toEqual([]);
	});
});

describe("a linha do livro-caixa vira linha de custo com dia e vínculo", () => {
	it("linha com conversa carrega o id da conversa e o dia do negócio", () => {
		const linhas = linhasDoLivroLocal([beatDoVendedor()]);
		expect(linhas).toHaveLength(1);
		expect(linhas[0]?.sessionId).toBe(CONVERSA);
		expect(linhas[0]?.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("sem conversa no período, o resultado é `sem_vinculo`", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([beatDoVendedor()]),
			conversas: [],
			cotacaoUsdBrl: 5.5,
		});
		expect(r.tipo).toBe("motivo");
		if (r.tipo !== "motivo") return;
		expect(r.motivo).toBe("sem_vinculo");
	});
});

describe("P217/P273 — o cache do prompt entra no custo do livro-caixa", () => {
	// Um beat real do turno: 12.000 tokens de prompt chegam como 1.500 de entrada,
	// 10.000 de leitura de cache e 500 de escrita.
	function beatComCache(over: Partial<UsoDeIaGravado> = {}): UsoDeIaGravado {
		return beatDoVendedor({
			modelo: "claude-haiku-4-5",
			tokensInput: 1_500,
			tokensOutput: 800,
			tokensCacheRead: 10_000,
			tokensCacheWrite: 500,
			...over,
		});
	}

	it("a linha cobra o cache: o mesmo beat com cache custa mais que sem", () => {
		const [comCache] = linhasDoLivroLocal([beatComCache()]);
		const [semCache] = linhasDoLivroLocal([
			beatComCache({ tokensCacheRead: null, tokensCacheWrite: null }),
		]);

		// Entrada 0,15 + saída 0,40 = 0,55 centavo; com cache, +0,10 (lido) +0,0625 (escrito).
		expect(semCache?.custoUsdCents).toBeCloseTo(0.55, 10);
		expect(comCache?.custoUsdCents).toBeCloseTo(0.7125, 10);
	});

	it("o total da tela soma o cache, não só entrada e saída", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([beatComCache()]),
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 1,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		expect(r.usdCents).toBeCloseTo(0.7125, 10);
	});

	it("o cache sem preço do default deixa o total PARCIAL, não o apaga", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([
				beatComCache(),
				// O qwen não publica preço de cache: esta linha é desconhecida, não 0.
				beatDoVendedor({ tokensCacheRead: 10_000 }),
			]),
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 1,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		expect(r.usdCents).toBeCloseTo(0.7125, 10);
		expect(r.parcial).toBe(true);
		expect(r.semPreco).toEqual([{ modelo: "qwen3.6-flash", linhas: 1 }]);
	});

	it("modelo sem preço de cache com cache reportado, sozinho no período: não calculável, modelo nomeado", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([beatDoVendedor({ tokensCacheRead: 10_000 })]),
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("motivo");
		if (r.tipo !== "motivo") return;
		expect(r.motivo).toBe("modelo_sem_preco");
		expect(r.modelosSemPreco).toEqual(["qwen3.6-flash"]);
	});
});

describe("P314 — chamada avulsa entra no total, numa linha própria", () => {
	/** Um insight de lead: gasta IA e não tem conversa a quem atribuir. */
	function chamadaAvulsa(over: Partial<UsoDeIaGravado> = {}): UsoDeIaGravado {
		return beatDoVendedor({
			conversationId: null,
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			tokensOutput: 0,
			...over,
		});
	}

	it("a chamada sem conversa não é descartada da linha de custo", () => {
		const linhas = linhasDoLivroLocal([chamadaAvulsa()]);

		expect(linhas).toHaveLength(1);
		expect(linhas[0]?.sessionId).toBeNull();
		expect(linhas[0]?.custoUsdCents).toBeCloseTo(100, 10); // 1M × US$ 1/M = 1 US$ = 100 centavos
	});

	it("o total GERAL soma a avulsa, e ela aparece na linha própria", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([beatDoVendedor(), chamadaAvulsa()]),
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		// 0,4 centavo da conversa + 100 centavos da avulsa.
		expect(r.usdCents).toBeCloseTo(100.4, 10);
		expect(r.semConversa.chamadas).toBe(1);
		expect(r.semConversa.usdCents).toBeCloseTo(100, 10);
		expect(r.semConversa.brlCents).toBe(500);
	});

	it("período só com chamada avulsa: o total é dela, não `sem_vinculo`", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([chamadaAvulsa()]),
			conversas: [],
			cotacaoUsdBrl: 5,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		expect(r.usdCents).toBeCloseTo(100, 10);
		expect(r.semConversa.chamadas).toBe(1);
	});
});

describe("P220/L43 — a falha de leitura se explica pelo Postgres, não pelo Langfuse", () => {
	it("`fonte_indisponivel` cita o livro-caixa `uso_de_ia`", async () => {
		const erro = vi.spyOn(console, "error").mockImplementation(() => {});

		const r = await computeCustoDeIA(
			{ de: new Date("2026-10-20T00:00:00Z"), ate: new Date("2026-10-20T23:59:59Z") },
			{
				lerUso: async () => {
					throw new Error("pg fora do ar");
				},
				lerConversas: async () => [],
				lerCotacao: async () => null,
			},
		);

		erro.mockRestore();

		expect(r.tipo).toBe("motivo");
		if (r.tipo !== "motivo") return;
		expect(r.motivo).toBe("fonte_indisponivel");
		expect(r.explicacao).toContain("uso_de_ia");
		expect(r.explicacao.toLowerCase()).not.toContain("langfuse");
	});
});
