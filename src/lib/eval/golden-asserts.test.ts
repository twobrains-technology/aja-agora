// checkScenario — o juiz DETERMINÍSTICO do golden-set: valida trajetória
// (artifacts/gates por turno), nunca prosa (CLAUDE.md: conversa é do modelo).
// Contaminação (fallback degradado com HTTP 200) é FALHA — o repo já pagou
// esse pedágio no driver r9.
import { describe, expect, it } from "vitest";
import { checkScenario, DEFAULT_CONTAMINATION_MARKERS } from "./golden-asserts";

function turn(over: Partial<Parameters<typeof checkScenario>[0][0]> = {}) {
	return {
		userMsg: "oi",
		agentText: "Olá! Vamos comparar consórcios?",
		artifactTypes: ["welcome"],
		httpStatus: 200,
		error: null,
		...over,
	};
}

describe("checkScenario", () => {
	it("passa quando todos os expectArtifacts aparecem no turno", () => {
		const out = checkScenario([turn()], { turns: [{ expectArtifacts: ["welcome"] }] });
		expect(out).toEqual({ pass: true, failures: [] });
	});

	it("falha quando artifact esperado não veio", () => {
		const out = checkScenario([turn({ artifactTypes: [] })], {
			turns: [{ expectArtifacts: ["gate:credit"] }],
		});
		expect(out.pass).toBe(false);
		expect(out.failures[0]).toContain("gate:credit");
	});

	it("falha quando artifact PROIBIDO aparece (ex.: busca antes de identify)", () => {
		const out = checkScenario([turn({ artifactTypes: ["comparison_table"] })], {
			turns: [{ forbidArtifacts: ["comparison_table"] }],
		});
		expect(out.pass).toBe(false);
		expect(out.failures[0]).toContain("comparison_table");
	});

	it("falha em HTTP != 200 ou erro de transporte", () => {
		const bad = checkScenario([turn({ httpStatus: 500 })], {});
		expect(bad.pass).toBe(false);
		const err = checkScenario([turn({ error: "timeout apos 90000ms" })], {});
		expect(err.pass).toBe(false);
	});

	it("falha em CONTAMINAÇÃO (fallback degradado com 200)", () => {
		const out = checkScenario(
			[turn({ agentText: `Hmm. ${DEFAULT_CONTAMINATION_MARKERS[0]}` })],
			{},
		);
		expect(out.pass).toBe(false);
		expect(out.failures[0].toLowerCase()).toContain("contamina");
	});

	it("markers extras do cenário somam aos default", () => {
		const out = checkScenario([turn({ agentText: "ainda não terminei de montar as opções" })], {
			forbidTextMarkers: ["ainda não terminei de montar"],
		});
		expect(out.pass).toBe(false);
	});

	it("turno sem asserts (null) é livre — só as checagens globais valem", () => {
		const out = checkScenario([turn(), turn({ artifactTypes: [] })], {
			turns: [{ expectArtifacts: ["welcome"] }, null],
		});
		expect(out.pass).toBe(true);
	});

	it("nunca asserta prosa: texto qualquer com trajetória certa passa", () => {
		const out = checkScenario(
			[turn({ agentText: "QUALQUER fraseado que o modelo escolher aqui." })],
			{ turns: [{ expectArtifacts: ["welcome"] }] },
		);
		expect(out.pass).toBe(true);
	});
});
