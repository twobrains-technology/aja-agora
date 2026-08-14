// A faixa de crédito nunca pode sair invertida do merge do analyzer.
//
// Produção, 13/08/2026, conversa `fa0533a0-…` (WhatsApp): o cliente pediu moto
// de R$ 20 mil com parcela de R$ 200 e o estado terminou assim —
//
//     "qualifyAnswers": { "creditMin": 18000, "creditMax": 6424, … }
//
// `creditMin` quase 3× MAIOR que `creditMax`. Reproduzi na stack local com o
// mesmo modelo (`claude-haiku-4-5`) e a conversa `2b594c6d-…` gravou a mesma
// inversão: `creditMin: 180000` com `creditMax: 20000`.
//
// Por que isso é código e não juízo de ninguém: faixa invertida é ARITMÉTICA
// errada, não questão de estilo — e ela vai direto para `searchGroups`, que
// exige `creditMax`/`creditMin` > 0 (OC-35, "cotas indisponíveis", reportada
// pela Bruna no mesmo dia). Uma busca com piso acima do teto não tem resposta
// possível: ou a Bevi devolve vazio, ou o `bevi-offer-guard` descarta o que
// vier — e o agente, sem oferta nenhuma, improvisa.
//
// O que produz a inversão: os dois valores são gravados JUNTOS num turno
// (`creditMin = creditMax * 0.9`) e depois um turno de correção regrava só o
// `creditMax` para um valor menor, deixando o `creditMin` antigo no estado.
// Este teste trava a invariante nos dois sentidos — quem escrever crédito no
// futuro por um caminho novo cai aqui.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { analyzeTurnMock } = vi.hoisted(() => ({ analyzeTurnMock: vi.fn() }));

vi.mock("@/lib/agent/turn-analyzer", async (original) => {
	const real = (await original()) as Record<string, unknown>;
	return { ...real, analyzeTurn: analyzeTurnMock };
});

import type { ConversationMetadata } from "@/lib/agent/personas";
import type { TurnAnalysis } from "@/lib/agent/turn-analyzer";
import { analyzeAndMerge } from "./analyze";

/** Saída do analyzer com só o que o caso precisa — o resto é o neutro dele. */
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
		userIntent: "providing_info",
		...campos,
	};
}

/** O estado logo depois de "20k" para a moto: faixa coerente e desire já
 *  respondido (é o que habilita o merge de crédito em texto livre). */
function metaDepoisDoValorDaMoto(): ConversationMetadata {
	return {
		desireAsked: true,
		desireAnswered: true,
		currentCategory: "moto",
		currentPersona: "moto",
		identityCollected: true,
		qualifyAnswers: { creditMax: 20_000, creditMin: 18_000, desiredItem: "uma moto" },
	} as ConversationMetadata;
}

beforeEach(() => {
	analyzeTurnMock.mockReset();
});

describe("faixa de crédito no merge do analyzer", () => {
	it("correção para um valor MENOR não deixa o creditMin antigo para trás", async () => {
		const meta = metaDepoisDoValorDaMoto();

		// Turno "200": o analyzer real classificou como crédito de R$ 200 mil
		// (medido no log local: `credit=null-200000`). Aqui não importa se essa
		// extração é certa ou errada — importa que o estado que ela deixa seja
		// aritmeticamente válido.
		analyzeTurnMock.mockResolvedValueOnce(analise({ creditMax: 200_000 }));
		await analyzeAndMerge("200", "moto", meta, "Qual parcela cabe no seu bolso?");

		// Turno da correção: "200 reais a parcela nao 200 mill" → volta para 20 mil.
		analyzeTurnMock.mockResolvedValueOnce(analise({ creditMax: 20_000 }));
		await analyzeAndMerge("200 reais a parcela nao 200 mill", "moto", meta, "Quanto custa a moto?");

		const { creditMin, creditMax } = meta.qualifyAnswers ?? {};
		expect(creditMax).toBe(20_000);
		expect(creditMin ?? 0).toBeLessThanOrEqual(creditMax ?? 0);
	});

	it("nenhuma sequência de extrações deixa piso acima do teto", async () => {
		const meta = metaDepoisDoValorDaMoto();
		// Sobe, desce, sobe de novo — é o vaivém real de quem está decidindo.
		for (const valor of [200_000, 20_000, 35_000, 18_000]) {
			analyzeTurnMock.mockResolvedValueOnce(analise({ creditMax: valor }));
			await analyzeAndMerge(String(valor), "moto", meta, "Quanto custa a moto?");

			const { creditMin, creditMax } = meta.qualifyAnswers ?? {};
			expect(
				creditMin ?? 0,
				`faixa invertida depois de extrair ${valor}: min=${creditMin} max=${creditMax}`,
			).toBeLessThanOrEqual(creditMax ?? 0);
		}
	});
});

describe("prazo extraído do número errado", () => {
	it("não grava prazo fora do catálogo (o '200' da parcela virando 200 meses)", async () => {
		const meta = metaDepoisDoValorDaMoto();
		// Turno real de 14/08: o classificador devolveu prazoMeses=200 sem parcela
		// nenhuma. 200 meses não existe no produto — o maior horizonte é 120.
		analyzeTurnMock.mockResolvedValueOnce(analise({ prazoMeses: 200 }));
		await analyzeAndMerge("200", "moto", meta, "Qual parcela cabe no seu bolso?");
		expect(meta.qualifyAnswers?.prazoMeses).toBeUndefined();
	});

	it("prazo dentro do catálogo continua entrando", async () => {
		const meta = metaDepoisDoValorDaMoto();
		analyzeTurnMock.mockResolvedValueOnce(analise({ prazoMeses: 60 }));
		await analyzeAndMerge("uns 5 anos", "moto", meta, "Em quanto tempo você quer?");
		expect(meta.qualifyAnswers?.prazoMeses).toBe(60);
	});
});
