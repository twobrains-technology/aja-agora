import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "./system-prompt";

// ============================================================================
// FIX-293 (rodada r9 onda 4, veredito r9pos3 §3 P2 UX, probe-i2-justificativa
// turnos 8-9) — sob pressão o modelo inventava estado de grupo ("às vezes
// esses grupos já estão cheios ou pausados") e especulava sobre administradora
// ("provavelmente era de outra administradora") sem NENHUM tool-output que
// sustentasse — texto livre, fora do caminho de tool-error (onde o FIX-282 já
// resolve com resposta determinística). Reforço de prompt pro caminho
// residual (perguntas fora do padrão regex de isExactnessOrCriteriaQuestion).
// ============================================================================

describe("FIX-293 — proibição explícita de fabricar estado de grupo na justificativa", () => {
	it("SPECIALIST_BASE_PROMPT proíbe alegar grupo cheio/pausado/outra administradora sem tool-output", () => {
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		expect(combined).toMatch(/cheio|pausado/i);
		expect(combined).toMatch(/outra administradora/i);
	});

	it("a regra é uma proibição explícita (REGRA DURA), não uma sugestão", () => {
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		const section = combined.match(/[\s\S]{0,300}(cheio|pausado)[\s\S]{0,300}/i)?.[0] ?? "";
		expect(section).toMatch(/PROIBIDO|NUNCA|SÓ pode|só.*tool/i);
	});

	it("a regra ancora a justificativa no scoreBreakdown/tool-output real, nunca em especulação", () => {
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		const section = combined.match(/[\s\S]{0,400}(cheio|pausado)[\s\S]{0,400}/i)?.[0] ?? "";
		expect(section).toMatch(/tool|score/i);
	});
});
