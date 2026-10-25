import { describe, expect, it } from "vitest";
import { linhasDoLivroLocal, somarCustoDeIA, type UsoDeIaGravado } from "./custo-de-ia";

const CONVERSA = "11111111-1111-1111-1111-111111111111";

/** Um beat do default do vendedor: 80.000 tokens de entrada × US$ 0,05/M = 0,4 centavo. */
function beatDoVendedor(over: Partial<UsoDeIaGravado> = {}): UsoDeIaGravado {
	return {
		conversationId: CONVERSA,
		modelo: "qwen3.6-flash",
		tokensInput: 80000,
		tokensOutput: 0,
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

describe("L24 — modelo sem preço continua nomeado, nunca custo 0", () => {
	it("o modelo do default é calculável; o desconhecido sai nomeado", () => {
		const linhas = linhasDoLivroLocal([
			beatDoVendedor(),
			beatDoVendedor({ modelo: "modelo-sem-preco-de-teste" }),
		]);

		expect(linhas[1]?.custoUsdCents).toBeNull();

		const r = somarCustoDeIA({
			linhas,
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("motivo");
		if (r.tipo !== "motivo") return;
		expect(r.motivo).toBe("modelo_sem_preco");
		expect(r.modelosSemPreco).toEqual(["modelo-sem-preco-de-teste"]);
	});
});

describe("a linha do livro-caixa vira linha de custo com dia e vínculo", () => {
	it("linha sem conversa não entra: custo sem vínculo não é atribuível", () => {
		const linhas = linhasDoLivroLocal([beatDoVendedor({ conversationId: null }), beatDoVendedor()]);
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
