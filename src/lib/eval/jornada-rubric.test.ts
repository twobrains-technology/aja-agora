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
	reforcosPasso5: 1,
	assinaturaSemTrocarEmpresa: 0.9,
	flags: {
		pulouPasso: false,
		fechouEmLeadEmVezDeContrato: false,
		jargaoNoLeigo: false,
		tomRoboticoOuFrio: false,
		metaNarrativaDoMecanismo: false,
		faltaramReforcos: false,
		faltouParabens: false,
		faltouResumoContratacao: false,
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

	it("v2 — âncoras que faltavam (revisão adversarial 2026-06-04)", () => {
		// Botão pós-explicação de primeira vez (docx linha 20).
		expect(p).toContain("Entendi, pode continuar");
		// Campos do resumo por opção (docx linha 38) — só o que a fonte fornece.
		expect(p).toMatch(/contemplados\/m[êe]s|contemplados por m[êe]s/i);
		expect(p).toMatch(/tipo de grupo/i);
		// Outras opções sob demanda (docx linha 37).
		expect(p).toMatch(/outras op[çc][õo]es/i);
		// Fechamento completo (docx linhas 51-53).
		expect(p).toContain("Parabéns! Agora você está oficialmente mais perto da sua conquista!");
		expect(p).toMatch(/resumo da contrata[çc][ãa]o/i);
		expect(p).toMatch(
			/sem.*sentir que.*mudou de empresa|sem o cliente sentir que "mudou de empresa"/i,
		);
	});

	it("v2 — limitação de fonte declarada: não cobrar o que a oferta Bevi não fornece", () => {
		// Reputação/histórico de contemplações NÃO existem na oferta self-contract —
		// o juiz não pode punir ausência de dado que a fonte não dá (nem aceitar invenção).
		expect(p).toMatch(/reputa[çc][ãa]o|hist[óo]rico de contempla/i);
		expect(p).toMatch(/n[ãa]o fornece|n[ãa]o exist|indispon[íi]vel/i);
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

	it("v2 — exige reforcosPasso5, assinaturaSemTrocarEmpresa e flags novas", () => {
		const { reforcosPasso5: _r, ...semReforcos } = validResult;
		expect(() => jornadaJudgeResultSchema.parse(semReforcos)).toThrow();
		const semFlagsNovas = {
			...validResult,
			flags: {
				pulouPasso: false,
				fechouEmLeadEmVezDeContrato: false,
				jargaoNoLeigo: false,
				tomRoboticoOuFrio: false,
				metaNarrativaDoMecanismo: false,
			},
		};
		expect(() => jornadaJudgeResultSchema.parse(semFlagsNovas)).toThrow();
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

	it("v2 — passo essencial FORA DE ORDEM também trava em <= 0.4 (ordem é o fluxo)", () => {
		const outOfOrder = jornadaJudgeResultSchema.parse({
			...validResult,
			steps: {
				...validResult.steps,
				passo2: { presente: true, ordemCorreta: false, fidelidade: 0.9, reasoning: "veio depois" },
			},
		});
		expect(fluxoScore(outOfOrder)).toBeLessThanOrEqual(0.4);
	});
});

describe("buildJornadaJudgePrompt", () => {
	it("inclui o transcript e pede avaliação por passo", () => {
		const prompt = buildJornadaJudgePrompt({ transcript: "Turn 1: oi\nTurn 2: olá" });
		expect(prompt).toContain("Turn 1: oi");
		expect(prompt).toMatch(/passo/i);
	});
});
