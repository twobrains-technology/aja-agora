import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "./system-prompt";

/**
 * Bug: aplicação inteira (agente + UI) escrita sem acentuação.
 * O agente espelha a ortografia do system prompt, então respondia sem acento.
 * Fix: regra dura explícita de ortografia no prompt + limpeza do texto de UI.
 *
 * Camada 1 (structural): garante que (a) o prompt instrui acentuação correta
 * e (b) o texto de UI visível ao usuário não contém palavras PT-BR sem acento.
 */
describe("regressão: acentuação", () => {
	it("SYSTEM_PROMPT exige acentuação correta em português", () => {
		expect(SYSTEM_PROMPT.toLowerCase()).toContain("acentua");
	});

	it("SPECIALIST_BASE_PROMPT exige acentuação correta em português", () => {
		expect(SPECIALIST_BASE_PROMPT.toLowerCase()).toContain("acentua");
	});

	it("texto de UI visível não contém palavras PT-BR sem acento", async () => {
		// Palavras que SEMPRE levam acento em PT-BR e jamais devem aparecer assim
		// dentro de texto JSX (entre > e <) ou em literais de string visíveis.
		const forbidden = [
			"voce",
			"consorcio",
			"simulacao",
			"recomendacao",
			"contemplacao",
			"credito",
			"informacoes",
			"servico",
			"disponivel",
			"periodo",
			"analise",
			"relatorio",
			"configuracao",
			"aprovacao",
			"orcamento",
			"obrigatorio",
			"comecar",
			"formulario",
			"imovel",
			"automovel",
		];
		const pattern = new RegExp(`>[^<>{}]*\\b(${forbidden.join("|")})\\b[^<>{}]*<`, "i");
		const root = join(__dirname, "..", "..");
		const offenders: string[] = [];
		for await (const file of glob("**/*.tsx", {
			cwd: root,
			exclude: (p) => p.includes("node_modules") || p.endsWith(".test.tsx"),
		})) {
			const content = readFileSync(join(root, file), "utf8");
			for (const line of content.split("\n")) {
				if (pattern.test(line)) offenders.push(`${file}: ${line.trim()}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
