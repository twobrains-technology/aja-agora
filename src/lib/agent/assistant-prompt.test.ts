import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	ASSISTANT_BASE_PROMPT,
	buildAssistantPrompt,
} from "./assistant-prompt";

const examplePersona = {
	id: "test-1",
	displayName: "Rafael Auto",
	role: "specialist" as const,
	category: "auto",
	expertise: "compactos",
	voiceTone: "formal e técnico",
	examples: [],
	forbiddenTopics: [],
	handoffTriggers: [],
	version: 1,
};

describe("ASSISTANT_BASE_PROMPT", () => {
	it("instrui a desambiguar antes de propor", () => {
		expect(ASSISTANT_BASE_PROMPT).toMatch(/desambigu/i);
		expect(ASSISTANT_BASE_PROMPT).toMatch(/ask_clarification/);
	});

	it("instrui a validar antes de propose_patch", () => {
		expect(ASSISTANT_BASE_PROMPT).toMatch(/valid/i);
		expect(ASSISTANT_BASE_PROMPT).toMatch(/validate_against_rules/);
	});

	it("instrui linguagem simples (admin leigo)", () => {
		expect(ASSISTANT_BASE_PROMPT).toMatch(/leigo|simples|sem jargão/i);
	});

	it("lista os 4 campos editáveis", () => {
		expect(ASSISTANT_BASE_PROMPT).toMatch(/voiceTone/);
		expect(ASSISTANT_BASE_PROMPT).toMatch(/examples/);
		expect(ASSISTANT_BASE_PROMPT).toMatch(/forbiddenTopics/);
		expect(ASSISTANT_BASE_PROMPT).toMatch(/handoffTriggers/);
	});

	it("proíbe explicitamente editar activeTools e activeCampaigns", () => {
		expect(ASSISTANT_BASE_PROMPT).toMatch(/NUNCA/);
		expect(ASSISTANT_BASE_PROMPT).toMatch(/activeTools/);
		expect(ASSISTANT_BASE_PROMPT).toMatch(/activeCampaigns/);
	});
});

describe("buildAssistantPrompt", () => {
	it("injeta HARD_RULES.md inteiro no prompt", () => {
		const hardRules = fs.readFileSync(
			path.join(process.cwd(), "src/lib/agent/HARD_RULES.md"),
			"utf8",
		);
		const built = buildAssistantPrompt(examplePersona);
		// Verifica que a primeira linha do HARD_RULES está no prompt
		const firstHeading = hardRules.split("\n")[0];
		expect(built).toContain(firstHeading);
	});

	it("injeta ficha da persona (displayName, role, category, voiceTone)", () => {
		const built = buildAssistantPrompt(examplePersona);
		expect(built).toContain("Rafael Auto");
		expect(built).toContain("specialist");
		expect(built).toContain("auto");
		expect(built).toContain("formal e técnico");
	});

	it("injeta personaVersion para anti-stale", () => {
		const built = buildAssistantPrompt(examplePersona);
		expect(built).toMatch(/version[^\n]*1/);
	});

	it("serializa examples/forbiddenTopics/handoffTriggers como JSON visível", () => {
		const built = buildAssistantPrompt({
			...examplePersona,
			examples: [
				{
					id: "ex-1",
					userMessage: "test",
					assistantResponse: "response",
				},
			],
		});
		expect(built).toContain("ex-1");
		expect(built).toContain("test");
		expect(built).toContain("response");
	});
});
