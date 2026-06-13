import { describe, expect, it } from "vitest";
import { formatCalibrationReport, makeDeterministicMockJudge, runCalibration } from "./calibration";
import {
	ALL_FIXTURES,
	FIXTURE_HALLUCINATION,
	FIXTURE_HAPPY_PATH,
	FIXTURE_LOW_ENGAGEMENT,
	FIXTURE_MULTI_PERSONA,
} from "./fixtures";
import { computeEvalFromData } from "./scorer-pipeline";

// Esses testes validam o PIPELINE (agregação, conversão, flags) com um juiz mock
// determinístico. Não substitui calibração com judge real (essa requer
// `scripts/eval-calibrate.mjs` + ANTHROPIC_API_KEY).

describe("computeEvalFromData — agregação básica", () => {
	it("happy path: overall coerente com dimensões altas + conversão alta", async () => {
		const judge = makeDeterministicMockJudge();
		const out = await computeEvalFromData(
			{
				status: FIXTURE_HAPPY_PATH.status,
				channel: FIXTURE_HAPPY_PATH.channel,
				currentPersona: FIXTURE_HAPPY_PATH.currentPersona,
				currentCategory: FIXTURE_HAPPY_PATH.currentCategory,
				messages: FIXTURE_HAPPY_PATH.messages,
				artifacts: FIXTURE_HAPPY_PATH.artifacts,
				lead: FIXTURE_HAPPY_PATH.lead,
				personas: FIXTURE_HAPPY_PATH.personas,
				metadata: FIXTURE_HAPPY_PATH.metadata,
			},
			judge,
		);
		expect(out.kind).toBe("success");
		if (out.kind !== "success") return;
		expect(out.overallScore).toBeGreaterThanOrEqual(0.6);
		expect(out.dimensions.conversao.score).toBe(1.0); // qualificado + lead
		expect(out.flags.hallucination).toBe(false);
	});

	it("hallucination fixture: assertividade baixa e flag true via cross-check determinístico", async () => {
		const judge = makeDeterministicMockJudge();
		const out = await computeEvalFromData(
			{
				status: FIXTURE_HALLUCINATION.status,
				channel: FIXTURE_HALLUCINATION.channel,
				currentPersona: FIXTURE_HALLUCINATION.currentPersona,
				currentCategory: FIXTURE_HALLUCINATION.currentCategory,
				messages: FIXTURE_HALLUCINATION.messages,
				artifacts: FIXTURE_HALLUCINATION.artifacts,
				lead: FIXTURE_HALLUCINATION.lead,
				personas: FIXTURE_HALLUCINATION.personas,
				metadata: FIXTURE_HALLUCINATION.metadata,
			},
			judge,
		);
		expect(out.kind).toBe("success");
		if (out.kind !== "success") return;
		expect(out.flags.hallucination).toBe(true); // cross-check pegou
		expect(out.signals.numbersInTextFlagged.length).toBeGreaterThan(0);
	});

	it("legacy (mensagens sem personaId): personaSegments=[], comportamento single-persona", async () => {
		const judge = makeDeterministicMockJudge();
		// Fixture happy path original tem messages SEM personaId — caminho legacy.
		const out = await computeEvalFromData(
			{
				status: FIXTURE_HAPPY_PATH.status,
				channel: FIXTURE_HAPPY_PATH.channel,
				currentPersona: FIXTURE_HAPPY_PATH.currentPersona,
				currentCategory: FIXTURE_HAPPY_PATH.currentCategory,
				messages: FIXTURE_HAPPY_PATH.messages,
				artifacts: FIXTURE_HAPPY_PATH.artifacts,
				lead: FIXTURE_HAPPY_PATH.lead,
				personas: FIXTURE_HAPPY_PATH.personas,
				metadata: FIXTURE_HAPPY_PATH.metadata,
			},
			judge,
		);
		expect(out.kind).toBe("success");
		if (out.kind !== "success") return;
		expect(out.signals.personaSegments).toEqual([]);
		// Conversa única-persona produz overall coerente.
		expect(out.overallScore).toBeGreaterThan(0.6);
	});

	it("multi-persona: signals expõem 2 segmentos e qualifyCoverage agregada", async () => {
		const judge = makeDeterministicMockJudge();
		const out = await computeEvalFromData(
			{
				status: FIXTURE_MULTI_PERSONA.status,
				channel: FIXTURE_MULTI_PERSONA.channel,
				currentPersona: FIXTURE_MULTI_PERSONA.currentPersona,
				currentCategory: FIXTURE_MULTI_PERSONA.currentCategory,
				messages: FIXTURE_MULTI_PERSONA.messages,
				artifacts: FIXTURE_MULTI_PERSONA.artifacts,
				lead: FIXTURE_MULTI_PERSONA.lead,
				personas: FIXTURE_MULTI_PERSONA.personas,
				metadata: FIXTURE_MULTI_PERSONA.metadata,
			},
			judge,
		);
		expect(out.kind).toBe("success");
		if (out.kind !== "success") return;
		expect(out.signals.personaSegments).toHaveLength(2);
		expect(out.signals.personaSegments[0].personaId).toBe("helena-imovel");
		expect(out.signals.personaSegments[1].personaId).toBe("rafael-auto");
		// imovel coletou creditRange + prazoMeses; auto coletou creditRange + hasLance = 4/4
		expect(out.signals.qualifyCoverage).toBe(1);
		expect(out.flags.hallucination).toBe(false);
	});

	it("falha do juiz vira EvalComputed.failure (não throw)", async () => {
		const failingJudge = async () => {
			throw new Error("simulated network failure");
		};
		const out = await computeEvalFromData(
			{
				status: FIXTURE_HAPPY_PATH.status,
				channel: FIXTURE_HAPPY_PATH.channel,
				currentPersona: FIXTURE_HAPPY_PATH.currentPersona,
				currentCategory: FIXTURE_HAPPY_PATH.currentCategory,
				messages: FIXTURE_HAPPY_PATH.messages,
				artifacts: FIXTURE_HAPPY_PATH.artifacts,
				lead: FIXTURE_HAPPY_PATH.lead,
				personas: FIXTURE_HAPPY_PATH.personas,
				metadata: FIXTURE_HAPPY_PATH.metadata,
			},
			failingJudge,
		);
		expect(out.kind).toBe("failure");
		if (out.kind !== "failure") return;
		expect(out.error).toContain("simulated network failure");
		// Sinais ainda computados (não dependem do juiz)
		expect(out.signals).toBeDefined();
	});
});

describe("runCalibration — sanidade do pipeline", () => {
	it("baseline mockada: pipeline aceita as 4 fixtures e produz relatório", async () => {
		const judge = makeDeterministicMockJudge();
		const report = await runCalibration(ALL_FIXTURES, judge);
		expect(report.results).toHaveLength(ALL_FIXTURES.length);
		// Mock determinístico não satisfaz todas expectativas das fixtures (por design,
		// pra validar que a calibração detecta divergência). Mas baseline não pode
		// ser 0% — sinaliza pipeline quebrado.
		expect(report.concordance).toBeGreaterThan(0.3);
		const formatted = formatCalibrationReport(report);
		expect(formatted).toContain("Concordância:");
	});

	it("flag must_be_true detecta quando juiz retorna false", async () => {
		const judgeNeverFlags = makeDeterministicMockJudge({ hallucination: false });
		const report = await runCalibration([FIXTURE_HALLUCINATION], judgeNeverFlags);
		// Esperamos hallucination=true pra essa fixture, mas se o threshold
		// determinístico (numbersInTextFlagged) disparar, a flag final fica true.
		// Esse teste verifica que o computeFlags faz OR corretamente.
		const r = report.results[0];
		const halluCheck = r.checks.find((c) => c.label === "flag.hallucination");
		expect(halluCheck).toBeDefined();
		expect(halluCheck?.passed).toBe(true); // threshold determinístico salvou
	});

	it("lowEngagement: threshold determinístico em discovery/engagement dispara mesmo sem juiz", async () => {
		const judge = makeDeterministicMockJudge({ engajamento: 0.2 });
		const report = await runCalibration([FIXTURE_LOW_ENGAGEMENT], judge);
		const r = report.results[0];
		const flagCheck = r.checks.find((c) => c.label === "flag.lowEngagement");
		expect(flagCheck?.passed).toBe(true);
	});
});
