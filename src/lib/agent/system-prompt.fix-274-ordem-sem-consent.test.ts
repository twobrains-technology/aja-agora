import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================================
// FIX-274/FIX-275 (2026-07-11) — o system-prompt tinha resíduos STALE que
// contrariavam a jornada nova:
//   - permitia "2 perguntas por mensagem" (:59) contra a regra dura de cadência
//     (máx 1 pergunta por balão — CK-1 do Kairo);
//   - descrevia a ordem antiga da coleta (experience → consent → identidade →
//     valor), com o gate `consent` que foi REMOVIDO (FIX-274).
// Estes testes estruturais travam o alinhamento do prompt com o funil real.
// ============================================================================

function promptSource(): string {
	return readFileSync(resolve(process.cwd(), "src/lib/agent/system-prompt.ts"), "utf-8");
}

describe("FIX-274/275 — o system-prompt está alinhado com a jornada sem consent", () => {
	it("NÃO permite mais de uma pergunta por mensagem (regra dura de cadência)", () => {
		const src = promptSource();
		expect(src).not.toMatch(/mais de 2 perguntas por mensagem/i);
		expect(src).toMatch(/UMA pergunta por mensagem/i);
	});

	it("a ordem de coleta NÃO lista mais o gate `consent` como passo ativo", () => {
		const src = promptSource();
		// nenhum item numerado da ordem pode ser "**consent**"
		expect(src).not.toMatch(/^\s*\d\.\s*\*\*consent\*\*/im);
	});

	it("descreve o desejo (bem + motivo) como os primeiros passos da coleta", () => {
		const src = promptSource();
		expect(src).toMatch(/desejo\s*—\s*o bem/i);
		expect(src).toMatch(/desejo\s*—\s*o motivo/i);
	});
});
