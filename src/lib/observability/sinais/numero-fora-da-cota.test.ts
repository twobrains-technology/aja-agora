// Testes do detector `numero_fora_da_cota` (bloco B4).
//
// Cobrem: caso fora-da-cota (número que nenhuma tool devolveu), caso limpo,
// escalas de mil/porcento, arredondamento de centavos e o no-op sem envs de
// Langfuse.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	afirmacoesComparativasFalsas,
	numerosForaDaCota,
	registrarAfirmacaoComparativaFalsa,
	registrarNumeroForaDaCota,
} from "./numero-fora-da-cota";

const ENV_LIGADO = {
	LANGFUSE_TRACING_ENABLED: "true",
	LANGFUSE_BASE_URL: "https://langfuse.example.com",
	LANGFUSE_PUBLIC_KEY: "pk-lf-test",
	LANGFUSE_SECRET_KEY: "sk-lf-test",
};

const logs: string[] = [];

describe("numerosForaDaCota", () => {
	// A mesma fala: a cota REAL (da tool) passou de R$ 80 mil, mas o agente
	// anunciou R$ 90 mil — número que nasceu no modelo.
	it("marca número citado que nenhuma tool devolveu", () => {
		const fora = numerosForaDaCota({
			fala: "Essa carta sai por R$ 90.000,00 com parcela de R$ 800,00.",
			resultadosDeTool: [
				{
					parcela: 800,
					credito: 80000,
					administradora: "Bevi",
				},
			],
		});
		expect(fora).toEqual(["R$ 90.000,00"]);
	});

	it("não marca quando o número veio da ferramenta", () => {
		const fora = numerosForaDaCota({
			fala: "Essa carta sai por R$ 80.000,00 com parcela de R$ 800,00.",
			resultadosDeTool: [{ parcela: 800, credito: 80000 }],
		});
		expect(fora).toEqual([]);
	});

	it("eco do que o CLIENTE disse no turno é fonte, não alucinação", () => {
		const fora = numerosForaDaCota({
			fala: "Perfeito — uma carta de R$ 400 mil cabe no seu plano.",
			falaDoCliente: "Procuro uma casa de R$ 400 mil.",
			resultadosDeTool: [],
		});
		expect(fora).toEqual([]);
	});

	it("escalas: 'mil' multiplica e porcento não confunde com valor cru", () => {
		const fora = numerosForaDaCota({
			fala: "Com lance de R$ 30 mil você paga 18% e o prazo é 200 meses.",
			resultadosDeTool: [{ lance: 30000, percentual: 18, prazoMeses: 200 }],
		});
		expect(fora).toEqual([]);
	});

	it("milhão sem tool vira fora-da-cota", () => {
		const fora = numerosForaDaCota({
			fala: "A carta é de R$ 1,2 milhão.",
			resultadosDeTool: [{ credito: 900000 }],
		});
		expect(fora).toEqual(["R$ 1,2 milhão"]);
	});

	it("arredondamento de centavos não finge alucinação (R$ 499.634 por 499633.76)", () => {
		const fora = numerosForaDaCota({
			fala: "Fica em R$ 499.634 no total.",
			resultadosDeTool: [{ total: 499633.76 }],
		});
		expect(fora).toEqual([]);
	});

	// Sem tool nenhum no turno, todo número é suspeito — mas número que o
	// agente não falou não existe. Sem números na fala, sinal limpo.
	it("fala sem número nenhum não marca nada", () => {
		const fora = numerosForaDaCota({
			fala: "Perfeito! Vou te mandar as opções agora.",
			resultadosDeTool: [],
		});
		expect(fora).toEqual([]);
	});
});

// ── AFIRMAÇÃO COMPARATIVA (recado de Kairo, 05/11) ──────────────────────
//
// Caso REAL medido que virou o requisito: o agente disse "a menor taxa" para a
// proposta 20486 (12,94%) quando a 50080 tinha 12,92%. Todo número da frase
// estava certo — o que era falso era o superlativo.
const PROPOSTAS_REAIS = [
	{
		proposalId: "20486",
		administradora: "Bevi",
		parcela: 1180,
		prazoMeses: 200,
		taxaAdministracao: 12.94,
	},
	{
		proposalId: "50080",
		administradora: "Bevi",
		parcela: 1175,
		prazoMeses: 200,
		taxaAdministracao: 12.92,
	},
];

describe("afirmacoesComparativasFalsas", () => {
	it("marca 'a menor taxa' quando outra proposta do conjunto tem taxa menor (20486 × 50080)", () => {
		const achados = afirmacoesComparativasFalsas({
			fala: "Pode ir na 20486, é a menor taxa: 12,94%.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});
		expect(achados).toEqual([
			{
				frase: "Pode ir na 20486, é a menor taxa: 12,94%.",
				dimensao: "taxa",
				dito: 12.94,
				melhor: 12.92,
			},
		]);
	});

	it("superlativo VERDADEIRO não marca (a 50080 é mesmo a menor taxa)", () => {
		const achados = afirmacoesComparativasFalsas({
			fala: "A 50080 é a menor taxa: 12,92%.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});
		expect(achados).toEqual([]);
	});

	it("fala que não é superlativo não marca", () => {
		const achados = afirmacoesComparativasFalsas({
			fala: "A taxa da 20486 é 12,94% e a da 50080 é 12,92%. Veja a tabela e me diz qual prefere.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});
		expect(achados).toEqual([]);
	});

	it("superlativo de parcela verdadeiro não marca; falso marca", () => {
		const verdadeiro = afirmacoesComparativasFalsas({
			fala: "A 50080 tem a menor parcela: R$ 1.175,00.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});
		expect(verdadeiro).toEqual([]);

		const falso = afirmacoesComparativasFalsas({
			fala: "A 20486 tem a menor parcela: R$ 1.180,00.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});
		expect(falso).toHaveLength(1);
		expect(falso[0]).toMatchObject({ dimensao: "parcela", dito: 1180, melhor: 1175 });
	});

	it("número que nenhuma tool devolveu não é deste sinal (é do detector numérico)", () => {
		const achados = afirmacoesComparativasFalsas({
			fala: "Essa é a menor taxa: 9,99%.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});
		expect(achados).toEqual([]);
	});

	it("sem conjunto (uma opção só) não há superlativo a conferir", () => {
		const achados = afirmacoesComparativasFalsas({
			fala: "Essa é a menor taxa: 12,94%.",
			resultadosDeTool: [PROPOSTAS_REAIS[0]],
		});
		expect(achados).toEqual([]);
	});

	it("o número pode vir na frase seguinte do mesmo turno", () => {
		const achados = afirmacoesComparativasFalsas({
			fala: "Essa é a menor taxa do comparativo. Fica em 12,94%.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});
		expect(achados).toHaveLength(1);
		expect(achados[0]).toMatchObject({ dimensao: "taxa", dito: 12.94, melhor: 12.92 });
	});
});

describe("registrarNumeroForaDaCota", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		logs.length = 0;
	});

	it("sem envs de Langfuse é no-op — nenhuma linha de sinal sai", () => {
		vi.stubEnv("LANGFUSE_TRACING_ENABLED", "");
		vi.stubEnv("LANGFUSE_BASE_URL", "");
		vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
		vi.stubEnv("LANGFUSE_SECRET_KEY", "");
		vi.stubEnv("NODE_ENV", "test");
		vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

		registrarNumeroForaDaCota({
			traceId: "trace-1",
			fala: "R$ 90.000,00",
			resultadosDeTool: [{ credito: 80000 }],
		});

		expect(logs.some((l) => l.includes("numero_fora_da_cota"))).toBe(false);
	});

	it("com envs ligadas, grava BOOLEAN no trace — 1 com número fora, 0 limpo", () => {
		vi.stubEnv("LANGFUSE_TRACING_ENABLED", ENV_LIGADO.LANGFUSE_TRACING_ENABLED);
		vi.stubEnv("LANGFUSE_BASE_URL", ENV_LIGADO.LANGFUSE_BASE_URL);
		vi.stubEnv("LANGFUSE_PUBLIC_KEY", ENV_LIGADO.LANGFUSE_PUBLIC_KEY);
		vi.stubEnv("LANGFUSE_SECRET_KEY", ENV_LIGADO.LANGFUSE_SECRET_KEY);
		vi.stubEnv("NODE_ENV", "test");
		vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

		registrarNumeroForaDaCota({
			traceId: "trace-1",
			fala: "R$ 90.000,00",
			resultadosDeTool: [{ credito: 80000 }],
		});
		registrarNumeroForaDaCota({
			traceId: "trace-2",
			fala: "R$ 80.000,00",
			resultadosDeTool: [{ credito: 80000 }],
		});

		const parse = (linha: string) =>
			JSON.parse(linha.slice(linha.indexOf("scores=") + "scores=".length)) as Array<{
				name: string;
				value: number;
				traceId?: string;
			}>;
		const linhas = logs.filter((l) => l.includes("numero_fora_da_cota"));
		expect(linhas).toHaveLength(2);
		expect(parse(linhas[0])[0]).toMatchObject({
			name: "numero_fora_da_cota",
			value: 1,
			traceId: "trace-1",
		});
		expect(parse(linhas[1])[0]).toMatchObject({
			name: "numero_fora_da_cota",
			value: 0,
			traceId: "trace-2",
		});
	});

	it("ferramenta que estoura nunca derruba o turno — falha engolida com log", () => {
		vi.stubEnv("LANGFUSE_TRACING_ENABLED", "true");
		vi.stubEnv("LANGFUSE_BASE_URL", "https://langfuse.example.com");
		vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-lf-test");
		vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-lf-test");
		const erroConsole = vi
			.spyOn(console, "error")
			.mockImplementation((msg) => logs.push(String(msg)));
		vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

		// payload hostil: getter que lança
		const hostil = {
			get credito(): number {
				throw new Error("boom");
			},
		};

		expect(() =>
			registrarNumeroForaDaCota({
				traceId: "trace-3",
				fala: "R$ 90.000,00",
				resultadosDeTool: [hostil],
			}),
		).not.toThrow();
		expect(erroConsole).toHaveBeenCalled();
	});
});

describe("registrarAfirmacaoComparativaFalsa", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		logs.length = 0;
	});

	it("sem envs de Langfuse é no-op — nenhuma linha de sinal sai", () => {
		vi.stubEnv("LANGFUSE_TRACING_ENABLED", "");
		vi.stubEnv("LANGFUSE_BASE_URL", "");
		vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
		vi.stubEnv("LANGFUSE_SECRET_KEY", "");
		vi.stubEnv("NODE_ENV", "test");
		vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

		registrarAfirmacaoComparativaFalsa({
			traceId: "trace-1",
			fala: "Pode ir na 20486, é a menor taxa: 12,94%.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});

		expect(logs.some((l) => l.includes("afirmacao_comparativa_falsa"))).toBe(false);
	});

	it("com envs ligadas, grava BOOLEAN no trace — 1 com superlativo falso, 0 limpo", () => {
		vi.stubEnv("LANGFUSE_TRACING_ENABLED", ENV_LIGADO.LANGFUSE_TRACING_ENABLED);
		vi.stubEnv("LANGFUSE_BASE_URL", ENV_LIGADO.LANGFUSE_BASE_URL);
		vi.stubEnv("LANGFUSE_PUBLIC_KEY", ENV_LIGADO.LANGFUSE_PUBLIC_KEY);
		vi.stubEnv("LANGFUSE_SECRET_KEY", ENV_LIGADO.LANGFUSE_SECRET_KEY);
		vi.stubEnv("NODE_ENV", "test");
		vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));

		registrarAfirmacaoComparativaFalsa({
			traceId: "trace-1",
			fala: "Pode ir na 20486, é a menor taxa: 12,94%.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});
		registrarAfirmacaoComparativaFalsa({
			traceId: "trace-2",
			fala: "A 50080 é a menor taxa: 12,92%.",
			resultadosDeTool: [PROPOSTAS_REAIS],
		});

		const parse = (linha: string) =>
			JSON.parse(linha.slice(linha.indexOf("scores=") + "scores=".length)) as Array<{
				name: string;
				value: number;
				traceId?: string;
				comment?: string;
			}>;
		const linhas = logs.filter((l) => l.includes("afirmacao_comparativa_falsa"));
		expect(linhas).toHaveLength(2);
		expect(parse(linhas[0])[0]).toMatchObject({
			name: "afirmacao_comparativa_falsa",
			value: 1,
			traceId: "trace-1",
		});
		expect(parse(linhas[0])[0]?.comment).toContain("12,94");
		expect(parse(linhas[1])[0]).toMatchObject({
			name: "afirmacao_comparativa_falsa",
			value: 0,
			traceId: "trace-2",
		});
	});
});
