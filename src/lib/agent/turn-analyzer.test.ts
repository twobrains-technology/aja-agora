import { describe, expect, it } from "vitest";
import { turnAnalysisSchema } from "./turn-analyzer";

// FIX-363: "servicos" foi extinta como modalidade — a Camila (persona de
// serviços) tinha que ser "demitida". O schema zod é o invariante
// determinístico que barra qualquer tentativa do LLM de classificar texto
// livre ("reforma", "viagem", etc.) como "servicos": mesmo que o modelo
// alucine esse valor, generateObject rejeita porque não é mais um dos
// literais do enum. Não há branch de categoria pra "servicos" — ela
// simplesmente não existe no domínio.
describe("turnAnalysisSchema — categoria servicos extinta (FIX-363)", () => {
	const base = {
		reasoning: "teste",
		detectedSubTopic: null,
		isExplicitSwitch: false,
		expertiseLevel: "neutro" as const,
		experiencePrev: null,
		creditMin: null,
		creditMax: null,
		prazoMeses: null,
		hasLance: null,
		desiredItem: null,
		motivation: null,
		monthlySavings: null,
		fgtsValue: null,
		userIntent: "neutral" as const,
	};

	it("rejeita 'servicos' como detectedCategory — categoria inexistente no domínio", () => {
		const result = turnAnalysisSchema.safeParse({ ...base, detectedCategory: "servicos" });
		expect(result.success).toBe(false);
	});

	it("aceita as 3 categorias válidas restantes", () => {
		for (const category of ["imovel", "auto", "moto"] as const) {
			const result = turnAnalysisSchema.safeParse({ ...base, detectedCategory: category });
			expect(result.success).toBe(true);
		}
	});

	it("aceita null quando não há categoria detectada", () => {
		const result = turnAnalysisSchema.safeParse({ ...base, detectedCategory: null });
		expect(result.success).toBe(true);
	});
});
