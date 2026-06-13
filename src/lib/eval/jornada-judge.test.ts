import type { generateObject } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { __setJornadaGenerateObjectForTests, judgeJornada } from "./jornada-judge";
import { fluxoScore, type JornadaJudgeResult } from "./jornada-rubric";

// Wiring do judgeJornada com seam (zero rede) — o julgamento REAL roda nightly
// no eval; aqui travamos que o pipeline schema→result→fluxoScore funciona.

const step = (fidelidade: number, presente = true) => ({
	presente,
	ordemCorreta: presente,
	fidelidade,
	reasoning: "evidência",
});

const fakeResult: JornadaJudgeResult = {
	steps: {
		passo1: step(0.9),
		passo2: step(0.8),
		passo3: step(1),
		passo4: step(0.7),
		passo5: step(0.9),
	},
	tom: { score: 0.85, reasoning: "caloroso e didático" },
	didaticaLeigo: 0.9,
	educacaoLanceEmbutido: 0.8,
	fechamentoContratacao: 1,
	reforcosPasso5: 1,
	assinaturaSemTrocarEmpresa: 0.9,
	confrontoViabilidade: 0.9,
	flags: {
		pulouPasso: false,
		fechouEmLeadEmVezDeContrato: false,
		jargaoNoLeigo: false,
		tomRoboticoOuFrio: false,
		prometeuCreditoImediato: false,
		metaNarrativaDoMecanismo: false,
		faltaramReforcos: false,
		faltouParabens: false,
		faltouResumoContratacao: false,
	},
	topIssues: [],
	topStrengths: ["fechou em contrato"],
};

afterEach(() => __setJornadaGenerateObjectForTests(null));

describe("judgeJornada — wiring com seam", () => {
	it("devolve o resultado estruturado do generateObject injetado", async () => {
		__setJornadaGenerateObjectForTests((async (opts: { prompt?: string; system?: string }) => {
			// O prompt do juiz deve conter o transcript e o system a rubric do docx.
			expect(opts.prompt).toContain("TRANSCRIPT-MARKER");
			expect(opts.system).toContain("Plano recomendado pela Aja Agora");
			return { object: fakeResult };
		}) as unknown as typeof generateObject);

		const { result } = await judgeJornada({ transcript: "Turn 1: TRANSCRIPT-MARKER" });
		expect(result.steps.passo5.fidelidade).toBe(0.9);
		expect(fluxoScore(result)).toBeCloseTo((0.9 + 0.8 + 1 + 0.7 + 0.9) / 5, 5);
	});
});
