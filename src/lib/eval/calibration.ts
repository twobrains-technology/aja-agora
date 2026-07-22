// Calibração: roda fixtures contra um juiz (real ou mockado) e mede concordância
// com as expectativas declaradas. Usado em:
//   - test (com mock determinístico): valida que o pipeline agrega corretamente
//   - script de calibração (com judge real): valida que o RUBRIC_SYSTEM_PROMPT
//     produz julgamentos dentro das faixas esperadas
//
// O conceito de "concordância" aqui não é absoluto (não temos ground truth real)
// — é a fração de expectativas que passaram. Útil pra detectar regressão no prompt.

import type { Fixture, FixtureExpectations, ScoreRange } from "./fixtures";
import { computeEvalFromData, type JudgeFn } from "./scorer-pipeline";

export type CalibrationCheck = {
	label: string;
	passed: boolean;
	detail: string;
};

export type FixtureResult = {
	fixtureId: string;
	fixtureName: string;
	overallScore: number | null;
	failed: boolean;
	error?: string;
	checks: CalibrationCheck[];
};

export type CalibrationReport = {
	results: FixtureResult[];
	totalChecks: number;
	passedChecks: number;
	concordance: number; // 0-1
};

export async function runCalibration(
	fixtures: Fixture[],
	judge: JudgeFn,
): Promise<CalibrationReport> {
	const results: FixtureResult[] = [];
	let totalChecks = 0;
	let passedChecks = 0;

	for (const fixture of fixtures) {
		const computed = await computeEvalFromData(
			{
				status: fixture.status,
				channel: fixture.channel,
				currentPersona: fixture.currentPersona,
				currentCategory: fixture.currentCategory,
				messages: fixture.messages,
				artifacts: fixture.artifacts,
				lead: fixture.lead,
				personas: fixture.personas,
				metadata: fixture.metadata,
			},
			judge,
		);

		if (computed.kind === "failure") {
			results.push({
				fixtureId: fixture.id,
				fixtureName: fixture.name,
				overallScore: null,
				failed: true,
				error: computed.error,
				checks: [],
			});
			continue;
		}

		const checks = evaluateExpectations(computed, fixture.expectations);
		const passed = checks.filter((c) => c.passed).length;
		totalChecks += checks.length;
		passedChecks += passed;

		results.push({
			fixtureId: fixture.id,
			fixtureName: fixture.name,
			overallScore: computed.overallScore,
			failed: false,
			checks,
		});
	}

	return {
		results,
		totalChecks,
		passedChecks,
		concordance: totalChecks === 0 ? 0 : passedChecks / totalChecks,
	};
}

function evaluateExpectations(
	computed: Extract<Awaited<ReturnType<typeof computeEvalFromData>>, { kind: "success" }>,
	expectations: FixtureExpectations,
): CalibrationCheck[] {
	const checks: CalibrationCheck[] = [];

	checks.push(makeRangeCheck("overallScore", computed.overallScore, expectations.overallScore));

	if (expectations.dimensions) {
		for (const [key, range] of Object.entries(expectations.dimensions)) {
			if (!range) continue;
			const actual = computed.dimensions[key as keyof typeof computed.dimensions]?.score;
			if (actual === undefined) {
				checks.push({
					label: `dimension.${key}`,
					passed: false,
					detail: `dimensão ausente no resultado`,
				});
				continue;
			}
			checks.push(makeRangeCheck(`dimension.${key}`, actual, range));
		}
	}

	if (expectations.flags) {
		for (const [key, expectation] of Object.entries(expectations.flags)) {
			if (!expectation || expectation === "any") continue;
			const actual = computed.flags[key as keyof typeof computed.flags];
			const expected = expectation === "must_be_true";
			checks.push({
				label: `flag.${key}`,
				passed: actual === expected,
				detail: `esperado ${expected}, atual ${actual}`,
			});
		}
	}

	return checks;
}

function makeRangeCheck(label: string, actual: number, range: ScoreRange): CalibrationCheck {
	const [min, max] = range;
	const passed = actual >= min && actual <= max;
	return {
		label,
		passed,
		detail: `esperado [${min.toFixed(2)}, ${max.toFixed(2)}], atual ${actual.toFixed(2)}`,
	};
}

export function formatCalibrationReport(report: CalibrationReport): string {
	const lines: string[] = [];
	for (const r of report.results) {
		const score = r.overallScore !== null ? r.overallScore.toFixed(2) : "—";
		lines.push(`\n[${r.fixtureId}] ${r.fixtureName} (overall=${score})`);
		if (r.failed) {
			lines.push(`  ✗ FALHOU: ${r.error}`);
			continue;
		}
		for (const check of r.checks) {
			const mark = check.passed ? "✓" : "✗";
			lines.push(`  ${mark} ${check.label} — ${check.detail}`);
		}
	}
	const pct = (report.concordance * 100).toFixed(1);
	lines.push(`\nConcordância: ${report.passedChecks}/${report.totalChecks} (${pct}%)`);
	return lines.join("\n");
}

/**
 * Mock determinístico de juiz: retorna scores fixos baseados em quantidade de
 * sinais detectados. Não tenta ser inteligente — propósito é validar que o
 * PIPELINE agrega corretamente, não que o juiz julga corretamente.
 */
export function makeDeterministicMockJudge(
	overrides: Partial<{
		engajamento: number;
		discovery: number;
		continuidade: number;
		naturalidade: number;
		assertividade: number;
		hallucination: boolean;
		missedHandoff: boolean;
	}> = {},
): JudgeFn {
	return async ({ signals }) => {
		const numbersFlagged = signals.numbersInTextFlagged.length > 0;
		return {
			result: {
				dimensions: {
					engajamento: {
						score: overrides.engajamento ?? signals.replyRate,
						reasoning: "mock",
					},
					discovery: {
						score: overrides.discovery ?? signals.qualifyCoverage,
						reasoning: "mock",
					},
					continuidade: {
						score: overrides.continuidade ?? 0.7,
						reasoning: "mock",
					},
					naturalidade: {
						score: overrides.naturalidade ?? 0.7,
						reasoning: "mock",
					},
					assertividade: {
						score: overrides.assertividade ?? (numbersFlagged ? 0.2 : 0.85),
						reasoning: "mock",
					},
				},
				flags: {
					hallucination: overrides.hallucination ?? numbersFlagged,
					missedHandoff: overrides.missedHandoff ?? false,
					incompleteDiscovery: false,
					lowEngagement: false,
				},
				topIssues: [],
				topStrengths: [],
			},
			tokensInput: 100,
			tokensOutput: 50,
			durationMs: 1,
		};
	};
}
