import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

/**
 * FIX-102 — a guarda determinística de colapso (collapseSelfDuplicatedText)
 * precisa estar CONECTADA em runner.ts, aplicada em fullResponse ANTES de
 * saveMessage — senão a função existe mas nunca roda no caminho de produção
 * (achado real, 2026-07-01: E2E web ao vivo mostrou "Boa...!Boa...!" na tela).
 */
describe("FIX-102: runner.ts aplica collapseSelfDuplicatedText antes de persistir", () => {
	it("importa collapseSelfDuplicatedText de ./collapse-self-duplicate", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(
			/import\s*{\s*collapseSelfDuplicatedText\s*}\s*from\s*["']\.\/collapse-self-duplicate["']/.test(
				src,
			),
			"runner.ts precisa importar collapseSelfDuplicatedText — sem isso a guarda " +
				"contra o eco/duplicação da LLM (FIX-102) não existe no caminho de produção.",
		).toBe(true);
	});

	it("chama collapseSelfDuplicatedText(fullResponse) ANTES do saveMessage", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		const collapseIdx = src.indexOf("collapseSelfDuplicatedText(fullResponse)");
		const saveIdx = src.indexOf("saveMessage(\n\t\t\tconversationId,\n\t\t\t\"assistant\"");
		expect(collapseIdx, "runner.ts precisa chamar collapseSelfDuplicatedText(fullResponse)").toBeGreaterThan(
			-1,
		);
		expect(
			saveIdx,
			"runner.ts precisa persistir a mensagem do assistant via saveMessage",
		).toBeGreaterThan(-1);
		expect(
			collapseIdx < saveIdx,
			"o colapso TEM que rodar ANTES do saveMessage — senão o texto duplicado " +
				"(bug real) ainda vai pro banco/histórico.",
		).toBe(true);
	});
});
