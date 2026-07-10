// FIX-268 (rodada 7, veredito Fable r6, residual D4 — "texto picotado no
// turno de decisão"): quando o card de scarcity NÃO existe (buildScarcityCard
// retorna null — sem groupId ancorado), nenhum evento "artifact" separa o
// text-delta do directive de scarcity do text-delta do directive de decision.
// pipeOrchestratorToWriter só fecha o balão aberto (closeTextIfOpen) em
// eventos como "artifact"/"gate" — sem um deles no meio, os dois textos caem
// no MESMO balão, colados sem espaçamento: "...só pra você saber:Boa! Então
// deixa eu confirmar com você:" (1 balão = 1 ideia violado). Igual ao padrão
// já usado em tests/regression/fix-237-cards-orfaos.test.ts: trava
// source-level que o bloco de decision emite um "text-boundary" ENTRE os dois
// directives, incondicional ao card existir.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-268 — scarcity e decision não colam no mesmo balão (index.ts)", () => {
	it("bloco de decision emite um evento 'text-boundary' entre buildScarcityDirective e buildDecisionPromptDirective", () => {
		const idx = readSource("src/lib/agent/orchestrator/index.ts");
		const decisionBlockStart = idx.indexOf('nextGateToFire === "decision"');
		expect(decisionBlockStart, "bloco de decision não encontrado em index.ts").toBeGreaterThan(-1);
		const nextBlockStart = idx.indexOf("if (result.nextGateToFire) {", decisionBlockStart + 1);
		const decisionBlock = idx.slice(
			decisionBlockStart,
			nextBlockStart > -1 ? nextBlockStart : decisionBlockStart + 2500,
		);

		const scarcityIdx = decisionBlock.indexOf("buildScarcityDirective");
		// FIX-272 (rodada 8, veredito Fable r7): um 2º boundary foi acrescentado
		// NO INÍCIO do bloco (fecha o balão do turno PRINCIPAL antes de entrar em
		// qualquer directive daqui) — busca a partir do scarcityIdx pra achar
		// especificamente o boundary ENTRE scarcity e decision, este teste.
		const boundaryIdx = decisionBlock.indexOf('type: "text-boundary"', scarcityIdx);
		const decisionDirectiveIdx = decisionBlock.lastIndexOf("buildDecisionPromptDirective");

		expect(scarcityIdx, "buildScarcityDirective não encontrado no bloco de decision").toBeGreaterThan(-1);
		expect(
			boundaryIdx,
			"esperava um evento text-boundary entre o directive de scarcity e o de decision — sem ele, os dois textos colam no mesmo balão quando o card de scarcity não existe",
		).toBeGreaterThan(-1);
		expect(decisionDirectiveIdx, "buildDecisionPromptDirective não encontrado no bloco de decision").toBeGreaterThan(
			-1,
		);

		expect(scarcityIdx).toBeLessThan(boundaryIdx);
		expect(boundaryIdx).toBeLessThan(decisionDirectiveIdx);
	});
});
