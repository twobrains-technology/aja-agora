import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HARD_RULES_PATH = path.join(process.cwd(), "src/lib/agent/HARD_RULES.md");
const CASSETTE_PATH = path.join(process.cwd(), "tests/regression/agent-trajectory.test.ts");
const SYSTEM_PROMPT_PATH = path.join(process.cwd(), "src/lib/agent/system-prompt.ts");

/**
 * Frases canônicas proibidas observadas em prod/staging.
 *
 * Cada item desta lista é um bug real que voltou; cada um precisa estar:
 *   (a) listado no HARD_RULES.md (pra o AI Assistant conhecer)
 *   (b) presente em pelo menos um cassette de agent-trajectory.test.ts
 *       (pra a regressão de comportamento ser detectada)
 *   (c) presente em system-prompt.ts (pra o agent de produção evitá-la)
 *
 * Adicionou frase aqui? Adicione também nos 3 lugares acima — o teste
 * abaixo trava a sincronia.
 */
const CANONICAL_FORBIDDEN_PHRASES = [
	// BUG-NO-CTA-AFTER-NAME — 9 variantes
	"Vamos achar a opção certa",
	// BUG-INTERNAL-REASONING-LEAK
	"Motivo:",
	"Reavaliando",
	// BUG-SHORT-GREETING-NO-TOOL / BUG-SAVE-CONTACT-NAME-MUST-FIRE
	"Prazer, Paulo!",
	// BUG-TOPIC-PICKER / BUG-TOPIC-PICKER-AUTO-VARIANT
	"olha as opcoes abaixo",
	"da uma olhada nas opcoes",
] as const;

const REQUIRED_HARD_RULES_SECTIONS = [
	/Frases absolutamente proibidas/i,
	/Fluxos obrigatórios/i,
	/Constraints por role/i,
	/Constraints por campo/i,
] as const;

describe("HARD_RULES.md — estrutura mínima", () => {
	it("existe e tem ao menos 100 linhas", () => {
		expect(fs.existsSync(HARD_RULES_PATH)).toBe(true);
		const content = fs.readFileSync(HARD_RULES_PATH, "utf8");
		const lines = content.split("\n").length;
		expect(lines).toBeGreaterThanOrEqual(100);
	});

	it("cobre as 4 seções obrigatórias", () => {
		const content = fs.readFileSync(HARD_RULES_PATH, "utf8");
		for (const section of REQUIRED_HARD_RULES_SECTIONS) {
			expect(content).toMatch(section);
		}
	});
});

describe("HARD_RULES.md — sincronia com cassettes Camada 2", () => {
	it("toda frase canônica proibida aparece no HARD_RULES.md", () => {
		const rules = normalize(fs.readFileSync(HARD_RULES_PATH, "utf8"));
		const missing = CANONICAL_FORBIDDEN_PHRASES.filter(
			(phrase) => !rules.includes(normalize(phrase)),
		);
		expect(missing, "Frases canônicas que faltam no HARD_RULES.md").toEqual([]);
	});

	it("toda frase canônica proibida aparece em algum cassette", () => {
		const cassettes = normalize(fs.readFileSync(CASSETTE_PATH, "utf8"));
		const missing = CANONICAL_FORBIDDEN_PHRASES.filter(
			(phrase) => !cassettes.includes(normalize(phrase)),
		);
		expect(missing, "Frases canônicas sem cassette de regressão").toEqual([]);
	});

	it("toda frase canônica proibida aparece em system-prompt.ts", () => {
		const prompt = normalize(fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8"));
		const missing = CANONICAL_FORBIDDEN_PHRASES.filter(
			(phrase) => !prompt.includes(normalize(phrase)),
		);
		expect(missing, "Frases canônicas que system-prompt.ts deveria proibir").toEqual([]);
	});
});

function normalize(s: string): string {
	return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
