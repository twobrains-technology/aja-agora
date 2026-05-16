import { describe, expect, it } from "vitest";
import {
	buildJudgePrompt,
	judgeResultSchema,
	type PersonaContext,
	RUBRIC_SYSTEM_PROMPT,
} from "./rubric";
import type { DeterministicSignals } from "./signals";

// Foco: prevenir regressão estrutural no system prompt e garantir que `buildJudgePrompt`
// injeta os contextos corretos. Cobre regras específicas do projeto (5 dimensões e não
// 6, persona context obrigatório, sinais formatados).

const baseSignals = (overrides: Partial<DeterministicSignals> = {}): DeterministicSignals => ({
	replyRate: 0.8,
	qualifyCoverage: 0.5,
	qualifyMissing: ["prazoMeses"],
	numbersInTextFlagged: [],
	dropOffGate: "timeframe",
	conversionStage: "engajado",
	hasLead: false,
	personaSegments: [],
	...overrides,
});

const basePersona = (overrides: Partial<PersonaContext> = {}): PersonaContext => ({
	personaId: "helena-imovel",
	voiceTone: "consultivo, didático",
	forbiddenTopics: [],
	...overrides,
});

describe("RUBRIC_SYSTEM_PROMPT (estrutura)", () => {
	it("tem exatamente 5 dimensões — Conversão é calculada deterministicamente", () => {
		const dimensions = RUBRIC_SYSTEM_PROMPT.match(
			/^### \d\. (Engajamento|Discovery|Continuidade|Naturalidade|Assertividade)/gm,
		);
		expect(dimensions).toHaveLength(5);
		expect(RUBRIC_SYSTEM_PROMPT).not.toMatch(/^### \d\. Conversão/m);
	});

	it("define âncoras 0.0 e 1.0 pra cada dimensão (mín 5 de cada)", () => {
		const oneAnchors = (RUBRIC_SYSTEM_PROMPT.match(/- 1\.0:/g) ?? []).length;
		const zeroAnchors = (RUBRIC_SYSTEM_PROMPT.match(/- 0\.0:/g) ?? []).length;
		expect(oneAnchors).toBeGreaterThanOrEqual(5);
		expect(zeroAnchors).toBeGreaterThanOrEqual(5);
	});

	it("descreve as 4 flags com seus critérios", () => {
		expect(RUBRIC_SYSTEM_PROMPT).toContain("hallucination");
		expect(RUBRIC_SYSTEM_PROMPT).toContain("missedHandoff");
		expect(RUBRIC_SYSTEM_PROMPT).toContain("incompleteDiscovery");
		expect(RUBRIC_SYSTEM_PROMPT).toContain("lowEngagement");
	});

	it("cabe na janela do juiz (prompt + transcript + persona ≤ 30k tokens razoável)", () => {
		// 8KB é cap conservador — em torno de 2k tokens pra system prompt.
		expect(RUBRIC_SYSTEM_PROMPT.length).toBeLessThan(8 * 1024);
	});
});

describe("judgeResultSchema (escopo do juiz)", () => {
	it("rejeita output sem alguma das 5 dimensões", () => {
		const validDimension = { score: 0.8, reasoning: "x" };
		const completeDims = {
			engajamento: validDimension,
			discovery: validDimension,
			continuidade: validDimension,
			naturalidade: validDimension,
			assertividade: validDimension,
		};
		const { discovery: _omit, ...incomplete } = completeDims;
		expect(
			judgeResultSchema.safeParse({
				dimensions: incomplete,
				flags: {
					hallucination: false,
					missedHandoff: false,
					incompleteDiscovery: false,
					lowEngagement: false,
				},
				topIssues: [],
				topStrengths: [],
			}).success,
		).toBe(false);
	});
});

describe("buildJudgePrompt — injeção de contexto", () => {
	it("inclui transcript, persona id, voice tone e signals numericamente", () => {
		const out = buildJudgePrompt({
			transcript: "TRANSCRIPT_PLACEHOLDER",
			personas: [basePersona()],
			signals: baseSignals(),
		});
		expect(out).toContain("TRANSCRIPT_PLACEHOLDER");
		expect(out).toContain("helena-imovel");
		expect(out).toContain("consultivo, didático");
		expect(out).toContain("0.80");
		expect(out).toContain("prazoMeses");
	});

	it("formata números flaggados com contexto pro juiz inspecionar", () => {
		const out = buildJudgePrompt({
			transcript: "x",
			personas: [basePersona()],
			signals: baseSignals({
				numbersInTextFlagged: [
					{ messageId: "a1", number: "R$ 850", context: "...parcela é de R$ 850 ao mês" },
				],
			}),
		});
		expect(out).toContain("R$ 850");
		expect(out).toContain("parcela é de R$ 850");
	});

	it("inclui forbiddenTopics quando configurados (juiz aplica como hard rule)", () => {
		const out = buildJudgePrompt({
			transcript: "x",
			personas: [basePersona({ forbiddenTopics: ["promessa de contemplação"] })],
			signals: baseSignals(),
		});
		expect(out).toContain("promessa de contemplação");
	});
});
