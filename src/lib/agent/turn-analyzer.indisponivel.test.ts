// D6 (02/10/2026) — o analyzer fora do ar não é o analyzer neutro.
//
// O fallback neutro sempre existiu (timeout de cold-start, erro de rede) e
// SEMPRE foi indistinguível de um turno em que o modelo não viu sinal nenhum:
// mesmo shape, mesmos nulls, `userIntent: "neutral"`. Com o analyzer no modelo
// do agente (D5) isso deixou de ser raro — produção levou 29× HTTP 400 "Your
// credit balance is too low" na call de 01/10 e cada um desses turnos caiu aqui
// calado. O `orchestrator/analyze.ts` então rodava `parseAssetValue` sem saber
// que estava sozinho, e "Entre R$ 800 e R$ 1.200" virou carta de R$ 800.
//
// A correção é o dado que faltava: o fallback se identifica. Quem sabe o que
// fazer com isso é o chamador (degradação determinística + score no Langfuse).
import { describe, expect, it, vi } from "vitest";

const { generateObjectMock } = vi.hoisted(() => ({ generateObjectMock: vi.fn() }));

vi.mock("ai", async (original) => {
	const real = (await original()) as Record<string, unknown>;
	return { ...real, generateObject: generateObjectMock };
});

import type { ConversationMetadata } from "./personas";
import { analyzeTurn } from "./turn-analyzer";

/** O que o modelo devolve quando responde — mesmo shape do fallback, SEM a
 *  marca. É contra este objeto que o teste do caminho normal compara. */
function respostaNeutra() {
	return {
		reasoning: "teste",
		detectedCategory: null,
		detectedSubTopic: null,
		isExplicitSwitch: false,
		expertiseLevel: "neutro" as const,
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
		userIntent: "neutral" as const,
	};
}

const META = { currentPersona: "auto", qualifyAnswers: {} } as ConversationMetadata;

describe("analyzer indisponível (D6)", () => {
	it("o fallback neutro carrega indisponivel: true quando a chamada falha", async () => {
		generateObjectMock.mockRejectedValue(
			new Error('HTTP 400: {"error":"Your credit balance is too low to access the Anthropic API"}'),
		);

		const r = await analyzeTurn("Entre R$ 800 e R$ 1.200", "auto", META);

		expect(r.indisponivel).toBe(true);
		// O resto do fallback continua neutro: quem degrada é o chamador.
		expect(r.creditMax).toBeNull();
		expect(r.parcelaMensal).toBeNull();
		expect(r.userIntent).toBe("neutral");
	});

	it("no caminho normal (o modelo respondeu) não há marca de indisponível", async () => {
		generateObjectMock.mockResolvedValue({ object: respostaNeutra() });

		const r = await analyzeTurn("olá", "auto", META);

		expect(r.indisponivel).toBeUndefined();
	});

	it("o timeout também é indisponibilidade — não só o 400", async () => {
		const abort = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
		generateObjectMock.mockRejectedValue(abort);

		const r = await analyzeTurn("quero um carro", "auto", META);

		expect(r.indisponivel).toBe(true);
	});
});
