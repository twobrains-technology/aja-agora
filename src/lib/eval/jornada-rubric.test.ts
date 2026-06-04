import { describe, expect, it } from "vitest";
import {
	buildJornadaJudgePrompt,
	fluxoScore,
	JORNADA_RUBRIC_SYSTEM_PROMPT,
	jornadaJudgeResultSchema,
} from "./jornada-rubric";

// Rubric do LLM-as-judge da JORNADA CANÔNICA (docs/jornada/jornada-canonica.md).
// Auditoria 2026-06-04: o eval da jornada prometia avaliar "tom" e "experiência
// do documento" mas só rodava regex/toContain — e a rubric genérica existente
// media a jornada antiga (sucesso=lead, não contrato). Esta rubric é POR PASSO
// do docx, com fechamento em CONTRATAÇÃO.

const validStep = { presente: true, ordemCorreta: true, fidelidade: 0.9, reasoning: "ok" };
const validResult = {
	steps: {
		passo1: validStep,
		passo2: validStep,
		passo3: validStep,
		passo4: validStep,
		passo5: validStep,
	},
	tom: { score: 0.8, reasoning: "caloroso" },
	didaticaLeigo: 0.9,
	educacaoLanceEmbutido: 0.8,
	fechamentoContratacao: 1,
	flags: {
		pulouPasso: false,
		fechouEmLeadEmVezDeContrato: false,
		jargaoNoLeigo: false,
		tomRoboticoOuFrio: false,
		metaNarrativaDoMecanismo: false,
	},
	topIssues: [],
	topStrengths: ["explicação didática"],
};

describe("JORNADA_RUBRIC_SYSTEM_PROMPT — ancorado no docx, não na implementação", () => {
	const p = JORNADA_RUBRIC_SYSTEM_PROMPT;

	it("cobre os 5 passos canônicos", () => {
		expect(p).toMatch(/passo 1/i);
		expect(p).toMatch(/passo 5/i);
		expect(p).toMatch(/Entender a necessidade/i);
		expect(p).toMatch(/Contratar/);
	});

	it("contém as âncoras literais do docx", () => {
		expect(p).toContain("Plano recomendado pela Aja Agora");
		expect(p).toContain("Esse plano faz sentido");
		expect(p).toMatch(/3, 6 ou 12 meses/);
		expect(p).toMatch(/lance embutido/i);
		expect(p).toContain("Seu objetivo primeiro. O melhor consórcio depois.");
	});

	it("define o fechamento como CONTRATAÇÃO, não captura de lead", () => {
		expect(p).toMatch(/contrata/i);
		expect(p).toMatch(/NÃO é captura de lead/i);
		expect(p).toContain("fechouEmLeadEmVezDeContrato");
	});

	it("avalia o TOM da escritora (caloroso, didático pra leigo, sem jargão)", () => {
		expect(p).toMatch(/calor|acolhedor/i);
		expect(p).toMatch(/leigo/i);
		expect(p).toMatch(/jarg[ãa]o/i);
	});
});

describe("jornadaJudgeResultSchema — saída estruturada do juiz", () => {
	it("aceita resultado válido", () => {
		expect(jornadaJudgeResultSchema.parse(validResult)).toBeTruthy();
	});

	it("rejeita fidelidade fora de 0-1", () => {
		const bad = {
			...validResult,
			steps: { ...validResult.steps, passo2: { ...validStep, fidelidade: 1.5 } },
		};
		expect(() => jornadaJudgeResultSchema.parse(bad)).toThrow();
	});

	it("exige as flags da jornada (pulouPasso, fechouEmLeadEmVezDeContrato…)", () => {
		const noFlags = { ...validResult, flags: { pulouPasso: false } };
		expect(() => jornadaJudgeResultSchema.parse(noFlags)).toThrow();
	});
});

describe("fluxoScore — fidelidade de fluxo com gate de passo essencial", () => {
	it("média das fidelidades quando tudo presente", () => {
		expect(fluxoScore(jornadaJudgeResultSchema.parse(validResult))).toBeCloseTo(0.9, 5);
	});

	it("passo essencial AUSENTE trava o score em <= 0.4 (pular etapa não passa)", () => {
		const missing = jornadaJudgeResultSchema.parse({
			...validResult,
			steps: {
				...validResult.steps,
				passo5: { presente: false, ordemCorreta: false, fidelidade: 0, reasoning: "não houve" },
			},
		});
		expect(fluxoScore(missing)).toBeLessThanOrEqual(0.4);
	});
});

describe("buildJornadaJudgePrompt", () => {
	it("inclui o transcript e pede avaliação por passo", () => {
		const prompt = buildJornadaJudgePrompt({ transcript: "Turn 1: oi\nTurn 2: olá" });
		expect(prompt).toContain("Turn 1: oi");
		expect(prompt).toMatch(/passo/i);
	});
});
