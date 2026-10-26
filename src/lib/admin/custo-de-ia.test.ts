import { describe, expect, it, vi } from "vitest";
import { JUDGE_MODEL } from "@/lib/eval/judge";
import {
	type ConversaDoPostgres,
	computeCustoDeIA,
	linhasDoLivroLocal,
	type MotivoSemCustoDeIA,
	somarCustoDeIA,
	type UsoDeIaGravado,
} from "./custo-de-ia";

const CONVERSA = "11111111-1111-1111-1111-111111111111";

/** Um beat do default do vendedor: 80.000 tokens de entrada × US$ 0,05/M = 0,4 centavo.
 *
 * O cache nasce MEDIDO em zero: é o que o turno grava desde o contrato com `precos.ts`
 * (0 = o provedor reportou zero; `null` = ninguém mediu — ver o bloco de P273). */
function beatDoVendedor(over: Partial<UsoDeIaGravado> = {}): UsoDeIaGravado {
	return {
		conversationId: CONVERSA,
		// A conversa desta linha é de operação; `true` é só a do simulador do admin.
		conversaSimulada: false,
		modelo: "qwen3.6-flash",
		tokensInput: 80000,
		tokensOutput: 0,
		tokensCacheRead: 0,
		tokensCacheWrite: 0,
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
			beatComCache({ tokensCacheRead: 0, tokensCacheWrite: 0 }),
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

describe("P273 — cache não medido não vira custo cheio nem apaga o período", () => {
	// A linha que o Pi gravou ANTES de medir o cache: input líquido, cache NULL. O gasto
	// de cache dela é desconhecido — e desconhecido não é zero (a mesma lei do modelo sem
	// preço), então ela fica fora da soma e o período sai PARCIAL.
	it("linha antiga com cache NULL: custo desconhecido, e o total sai PARCIAL", () => {
		const [antiga] = linhasDoLivroLocal([
			beatDoVendedor({ tokensCacheRead: null, tokensCacheWrite: null }),
		]);
		expect(antiga?.custoUsdCents).toBeNull();

		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([
				beatDoVendedor(),
				beatDoVendedor({ tokensCacheRead: null, tokensCacheWrite: null }),
			]),
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		// Só a linha MEDIDA entra: 0,4 centavo. A antiga não vira 0,4 nem 0.
		expect(r.usdCents).toBeCloseTo(0.4, 10);
		expect(r.parcial).toBe(true);
		expect(r.semPreco).toEqual([{ modelo: "qwen3.6-flash", linhas: 1 }]);
	});

	it("cache medido em ZERO é custo cheio: o período não é parcial", () => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal([beatDoVendedor({ tokensCacheRead: 0, tokensCacheWrite: 0 })]),
			conversas: [{ conversationId: CONVERSA, canal: "web" }],
			cotacaoUsdBrl: 5.5,
		});

		expect(r.tipo).toBe("valor");
		if (r.tipo !== "valor") return;
		expect(r.usdCents).toBeCloseTo(0.4, 10);
		expect(r.parcial).toBe(false);
		expect(r.semPreco).toEqual([]);
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

describe("P217/P219 — a população do custo: simulado fora, avulsa dentro, órfão real diagnosticado", () => {
	// O filtro de simulados só do lado das CONVERSAS deixava a linha do simulador na
	// população do livro-caixa: o cruzamento a lia como custo sem vínculo e a guarda de
	// `sem_vinculo` escondia a avulsa válida do período. A tabela abaixo é a população em
	// todas as combinações que interessam — porque o defeito voltou uma vez por rodada, cada
	// variação (canal, preço, cache, cotação, órfão, conversa fora da janela) tem o seu caso.
	//
	// A marca do simulador vem DO LIVRO-CAIXA (`conversaSimulada`, do join com
	// `conversations`), não da lista de conversas: por isso as conversas semeadas aqui são
	// só as de operação, e a do simulador nem aparece na lista.
	const SIMULADA = "22222222-2222-2222-2222-222222222222";
	const ORFA = "33333333-3333-3333-3333-333333333333";
	const COTACAO = 5.5;

	const conversaReal: ConversaDoPostgres = { conversationId: CONVERSA, canal: "web" };
	const conversaRealNoWhatsapp: ConversaDoPostgres = {
		conversationId: "44444444-4444-4444-4444-444444444444",
		canal: "whatsapp",
	};

	/** O turno da conversa de operação: 0,4 centavo de dólar. */
	const usoReal = (over: Partial<UsoDeIaGravado> = {}): UsoDeIaGravado =>
		beatDoVendedor({ conversaSimulada: false, ...over });
	/** O turno do simulador: 100 centavos — um número só dele, para ver se vazou. */
	const usoSimulado = (over: Partial<UsoDeIaGravado> = {}): UsoDeIaGravado =>
		beatDoVendedor({
			conversationId: SIMULADA,
			conversaSimulada: true,
			modelo: "claude-haiku-4-5",
			tokensInput: 1_000_000,
			...over,
		});
	/** A chamada avulsa (juiz, diagnóstico, insight): 30 centavos, sem conversa. */
	const usoAvulsa = (over: Partial<UsoDeIaGravado> = {}): UsoDeIaGravado =>
		beatDoVendedor({
			conversationId: null,
			conversaSimulada: null,
			modelo: "claude-haiku-4-5",
			tokensInput: 300_000,
			...over,
		});
	/** A linha de conversa que NÃO está no recorte: órfã REAL, não simulada. */
	const usoOrfao = (): UsoDeIaGravado =>
		beatDoVendedor({ conversationId: ORFA, conversaSimulada: false });

	type Esperado =
		| {
				tipo: "valor";
				usdCents: number;
				brlCents: number;
				parcial: boolean;
				avulsas: number;
				conversas: number;
		  }
		| { tipo: "motivo"; motivo: MotivoSemCustoDeIA; modelosSemPreco?: string[] };

	interface Cenario {
		nome: string;
		uso: UsoDeIaGravado[];
		conversas: ConversaDoPostgres[];
		canal?: "web" | "whatsapp";
		cotacao?: number | null;
		esperado: Esperado;
	}

	const CENARIOS: Cenario[] = [
		{
			nome: "conversa real, sem simulado no período: o turno real é o total",
			uso: [usoReal()],
			conversas: [conversaReal],
			esperado: {
				tipo: "valor",
				usdCents: 0.4,
				brlCents: 2,
				parcial: false,
				avulsas: 0,
				conversas: 1,
			},
		},
		{
			nome: "só simulado, com a conversa fora da janela lida: zero medido, e não `sem_vinculo`",
			uso: [usoSimulado()],
			conversas: [],
			esperado: {
				tipo: "valor",
				usdCents: 0,
				brlCents: 0,
				parcial: false,
				avulsas: 0,
				conversas: 0,
			},
		},
		{
			nome: "simulado + avulsa precificada, sem uso real: total = avulsa",
			uso: [usoSimulado(), usoAvulsa()],
			conversas: [],
			esperado: {
				tipo: "valor",
				usdCents: 30,
				brlCents: 165,
				parcial: false,
				avulsas: 1,
				conversas: 0,
			},
		},
		{
			nome: "real + simulado: só o real soma",
			uso: [usoReal(), usoSimulado()],
			conversas: [conversaReal],
			esperado: {
				tipo: "valor",
				usdCents: 0.4,
				brlCents: 2,
				parcial: false,
				avulsas: 0,
				conversas: 1,
			},
		},
		{
			nome: "real + simulado + avulsa: o total é real + avulsa",
			uso: [usoReal(), usoSimulado(), usoAvulsa()],
			conversas: [conversaReal],
			esperado: {
				tipo: "valor",
				usdCents: 30.4,
				brlCents: 167,
				parcial: false,
				avulsas: 1,
				conversas: 1,
			},
		},
		{
			nome: "simulado de modelo sem preço não marca o período como PARCIAL",
			uso: [usoSimulado({ modelo: "modelo-sem-preco-de-teste" })],
			conversas: [],
			esperado: {
				tipo: "valor",
				usdCents: 0,
				brlCents: 0,
				parcial: false,
				avulsas: 0,
				conversas: 0,
			},
		},
		{
			nome: "simulado com cache NULL não marca o período como PARCIAL",
			uso: [usoReal(), usoSimulado({ tokensCacheRead: null, tokensCacheWrite: null })],
			conversas: [conversaReal],
			esperado: {
				tipo: "valor",
				usdCents: 0.4,
				brlCents: 2,
				parcial: false,
				avulsas: 0,
				conversas: 1,
			},
		},
		{
			nome: "órfão real sozinho: `sem_vinculo` continua",
			uso: [usoOrfao()],
			conversas: [],
			esperado: { tipo: "motivo", motivo: "sem_vinculo" },
		},
		{
			nome: "órfão real ao lado de simulado + avulsa: o diagnóstico não é engolido",
			uso: [usoOrfao(), usoSimulado(), usoAvulsa()],
			conversas: [],
			esperado: { tipo: "motivo", motivo: "sem_vinculo" },
		},
		{
			nome: "órfão real ao lado de vínculo real: soma o que tem vínculo",
			uso: [usoOrfao(), usoReal()],
			conversas: [conversaReal],
			esperado: {
				tipo: "valor",
				usdCents: 0.4,
				brlCents: 2,
				parcial: false,
				avulsas: 0,
				conversas: 1,
			},
		},
		{
			nome: "recorte por canal com simulado no período: só o canal recortado, sem o simulado",
			uso: [
				usoSimulado(),
				usoReal(),
				usoReal({ conversationId: conversaRealNoWhatsapp.conversationId }),
			],
			conversas: [conversaReal, conversaRealNoWhatsapp],
			canal: "web",
			esperado: {
				tipo: "valor",
				usdCents: 0.4,
				brlCents: 2,
				parcial: false,
				avulsas: 0,
				conversas: 1,
			},
		},
		{
			nome: "avulsa sem preço ao lado de simulado: o modelo sem preço é nomeado",
			uso: [usoSimulado(), usoAvulsa({ modelo: "modelo-sem-preco-de-teste" })],
			conversas: [],
			esperado: {
				tipo: "motivo",
				motivo: "modelo_sem_preco",
				modelosSemPreco: ["modelo-sem-preco-de-teste"],
			},
		},
		{
			nome: "simulado + avulsa precificada sem cotação: `sem_cotacao`",
			uso: [usoSimulado(), usoAvulsa()],
			conversas: [],
			cotacao: null,
			esperado: { tipo: "motivo", motivo: "sem_cotacao" },
		},
		{
			nome: "cotação ausente só com simulado: zero medido não pede cotação",
			uso: [usoSimulado()],
			conversas: [],
			cotacao: null,
			esperado: {
				tipo: "valor",
				usdCents: 0,
				brlCents: 0,
				parcial: false,
				avulsas: 0,
				conversas: 0,
			},
		},
		{
			nome: "livro-caixa vazio com conversa real no período: `sem_dado`",
			uso: [],
			conversas: [conversaReal],
			esperado: { tipo: "motivo", motivo: "sem_dado" },
		},
		{
			nome: "livro-caixa vazio e nenhuma conversa: `sem_dado`",
			uso: [],
			conversas: [],
			esperado: { tipo: "motivo", motivo: "sem_dado" },
		},
	];

	it.each(CENARIOS)("$nome", (cenario) => {
		const r = somarCustoDeIA({
			linhas: linhasDoLivroLocal(cenario.uso),
			conversas: cenario.conversas,
			cotacaoUsdBrl: cenario.cotacao === undefined ? COTACAO : cenario.cotacao,
			canal: cenario.canal,
		});

		expect(r.tipo).toBe(cenario.esperado.tipo);
		if (cenario.esperado.tipo === "motivo") {
			if (r.tipo !== "motivo") return;
			expect(r.motivo).toBe(cenario.esperado.motivo);
			if (cenario.esperado.modelosSemPreco !== undefined) {
				expect(r.modelosSemPreco).toEqual(cenario.esperado.modelosSemPreco);
			}
			return;
		}
		if (r.tipo !== "valor") return;
		expect(r.usdCents).toBeCloseTo(cenario.esperado.usdCents, 10);
		expect(r.brlCents).toBe(cenario.esperado.brlCents);
		expect(r.parcial).toBe(cenario.esperado.parcial);
		expect(r.semConversa.chamadas).toBe(cenario.esperado.avulsas);
		expect(r.conversas).toBe(cenario.esperado.conversas);
	});
});
