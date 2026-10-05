// D6 (FIX-435) — analyzer fora do ar não troca parcela por valor do bem.
//
// Reproduz as duas sessões de produção do episódio "credit balance too low"
// (01/10 10:50–11:52), quando 29 chamadas do analyzer voltaram HTTP 400 e TODAS
// caíram no fallback neutro sem avisar:
//
//   • `0e5d777a` (11:47:38) — "Entre R$ 800 e R$ 1.200", resposta à pergunta
//     "quanto pretende pagar por mês?", virou `creditMin = creditMax = 800`. O
//     funil passou a buscar cartas de R$ 800 e o minuto exato é o do "ele não
//     deveria terminar o valor do bem".
//   • `8b64899b` — "Consigo pagar R$ 680/mês" não foi capturado como parcela, e
//     o agente perguntou de novo. `parseAssetValue` já devolve null com marcador
//     mensal (por design), mas ninguém preenchia `parcelaAlvo` no lugar.
//
// O modo indisponível é ESTREITO: só vale quando `analysis.indisponivel === true`
// (só o fallback carrega a marca). Com o modelo de pé nada muda — é o que o
// controle no fim deste arquivo mede.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { analyzeTurnMock } = vi.hoisted(() => ({ analyzeTurnMock: vi.fn() }));

vi.mock("@/lib/agent/turn-analyzer", async (original) => {
	const real = (await original()) as Record<string, unknown>;
	return { ...real, analyzeTurn: analyzeTurnMock };
});

import type { ConversationMetadata } from "@/lib/agent/personas";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";
import { analyzeAndMerge } from "./analyze";

function analise(campos: Partial<TurnAnalysis>): TurnAnalysis {
	return {
		reasoning: "teste",
		detectedCategory: null,
		detectedSubTopic: null,
		isExplicitSwitch: false,
		expertiseLevel: "neutro",
		experiencePrev: null,
		creditMin: null,
		creditMax: null,
		parcelaMensal: null,
		prazoMeses: null,
		hasLance: null,
		desiredItem: null,
		motivation: null,
		monthlySavings: null,
		fgtsValue: null,
		userIntent: "neutral",
		...campos,
	};
}

/** O turno em que o analyzer não respondeu: fallback neutro + a marca. */
function indisponivel(): TurnAnalysis {
	return analise({ indisponivel: true });
}

/** Conversa com o gate `credit` de fato ativo (categoria definida e desire já
 *  respondido) — é a janela em que "Entre R$ 800 e R$ 1.200" aconteceu. */
function noGateDeValor(): ConversationMetadata {
	return {
		currentPersona: "helena-auto",
		currentCategory: "auto",
		desireAsked: true,
		desireAnswered: true,
		qualifyAnswers: {},
	} as ConversationMetadata;
}

const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
	analyzeTurnMock.mockReset();
	process.env.VITRINE_CPF = "11144477735";
	process.env.VITRINE_CELULAR = "62992496793";
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
});

describe("analyzer indisponível — valor do bem", () => {
	it("faixa abaixo do piso da categoria NÃO vira valor do bem (0e5d777a)", async () => {
		// "R$ 800" dito respondendo a pergunta da PARCELA. O parser determinístico
		// pega o primeiro R$ da frase; sem o piso, ele entrava como teto de crédito
		// e a busca inteira saía na faixa de R$ 800.
		analyzeTurnMock.mockResolvedValue(indisponivel());

		const meta = noGateDeValor();
		await analyzeAndMerge("Entre R$ 800 e R$ 1.200", "helena-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
		expect(meta.qualifyAnswers?.creditMin).toBeUndefined();
	});

	it("valor do bem ACIMA do piso continua entrando — o caminho bom não regride", async () => {
		analyzeTurnMock.mockResolvedValue(indisponivel());

		const meta = noGateDeValor();
		await analyzeAndMerge("carro de 80 mil", "helena-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(80_000);
	});

	it("sem categoria não há piso pra comparar — o valor cru segue como antes", async () => {
		// Guarda de escopo: o piso é da CATEGORIA. Sem categoria (concierge) não
		// existe faixa de referência e o comportamento antigo fica de pé.
		analyzeTurnMock.mockResolvedValue(indisponivel());

		const meta = {
			currentPersona: "concierge",
			desireAsked: true,
			desireAnswered: true,
			qualifyAnswers: {},
		} as ConversationMetadata;
		await analyzeAndMerge("uns 80 mil", "concierge", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(80_000);
	});
});

describe("analyzer indisponível — parcela", () => {
	it("número com marcador mensal vira parcela, nunca valor do bem (8b64899b)", async () => {
		analyzeTurnMock.mockResolvedValue(indisponivel());

		const meta = noGateDeValor();
		await analyzeAndMerge("Quero um carro. Consigo pagar R$ 680/mês.", "helena-auto", meta);

		expect(meta.qualifyAnswers?.parcelaAlvo).toBe(680);
		expect(meta.qualifyAnswers?.alvoDeBusca).toBe("parcela");
		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
	});

	it("marcador escrito por extenso ('mensais') também vira parcela", async () => {
		analyzeTurnMock.mockResolvedValue(indisponivel());

		const meta = noGateDeValor();
		await analyzeAndMerge("essa parcela ta alta, no máximo 800 mensais", "helena-auto", meta);

		expect(meta.qualifyAnswers?.parcelaAlvo).toBe(800);
		expect(meta.qualifyAnswers?.alvoDeBusca).toBe("parcela");
		expect(meta.qualifyAnswers?.creditMax).toBeUndefined();
	});
});

describe("com o analyzer disponível nada muda", () => {
	it("o marcador mensal NÃO dispara o parser determinístico", async () => {
		// Controle do escopo: o parser só entra quando o modelo não respondeu. Com
		// resposta, quem extrai parcela é o analyzer — e é assim que fica.
		analyzeTurnMock.mockResolvedValue(analise({ userIntent: "providing_info" }));

		const meta = noGateDeValor();
		await analyzeAndMerge("Consigo pagar R$ 680/mês.", "helena-auto", meta);

		expect(meta.qualifyAnswers?.parcelaAlvo).toBeUndefined();
		expect(meta.qualifyAnswers?.alvoDeBusca).toBeUndefined();
	});

	it("valor do analyzer abaixo do piso segue o comportamento de hoje", async () => {
		// O piso é remédio do modo indisponível, não uma regra nova do funil: quem
		// interpreta texto livre é o LLM, e o guard dele é outro (`valorAncoradoNoTexto`).
		analyzeTurnMock.mockResolvedValue(analise({ creditMax: 800, userIntent: "providing_info" }));

		const meta = noGateDeValor();
		await analyzeAndMerge("Entre R$ 800 e R$ 1.200", "helena-auto", meta);

		expect(meta.qualifyAnswers?.creditMax).toBe(800);
	});
});
