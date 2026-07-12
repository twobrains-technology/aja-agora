import { describe, expect, it } from "vitest";
import { buildAction } from "./gate-quick-reply";

// Regressão BUG-LANCE-VALUE-GATE (2026-06-04, QA E2E jornada-bevi-real):
// o chip do gate `lance-value` clicado no chat web era enviado ao servidor como
// `{ gate: "lance", value: "12000" }` (fallthrough do buildAction), em vez de
// `{ gate: "lance-value", value: { lanceValue: 12000 } }`. O servidor então gravava
// `hasLance: "12000"` no metadata — corrompendo a máquina de gates: como
// `hasLance !== "yes"`, o gate `lance-embutido` (a feature-título da branch) NUNCA
// disparava e o fluxo pulava direto pro identify, violando AC-P0.1-a/b/c e a jornada
// canônica (docx passo 2, linhas 26-27).
//
// Camada 1 (structural). buildAction é função pura de mapeamento UI→action; não há
// comportamento de LLM aqui, então cassette (Camada 2) não se aplica (regra
// CLAUDE.md "Quando NÃO precisa adicionar cassette").

/** buildAction retorna a union ChatAction inteira — narrowing pro membro gate. */
function gateOf(action: ReturnType<typeof buildAction>) {
	if (action.kind !== "gate") throw new Error(`esperava kind 'gate', veio '${action.kind}'`);
	return action;
}

describe("buildAction — mapeamento de chip de gate para ChatAction (BUG-LANCE-VALUE-GATE)", () => {
	it("lance-value: token de valor (String(pct)) vira { gate: 'lance-value', value: { lanceValue: number } }", () => {
		const action = buildAction("lance-value", { value: "12000", label: "Uns R$ 12 mil" });
		expect(action).toEqual({
			kind: "gate",
			gate: "lance-value",
			value: { lanceValue: 12000 },
			label: "Uns R$ 12 mil",
		});
	});

	it("lance-value: NUNCA é enviado como gate 'lance' (que gravaria hasLance e pularia lance-embutido)", () => {
		const action = gateOf(buildAction("lance-value", { value: "6000", label: "Até R$ 6 mil" }));
		expect(action.gate).toBe("lance-value");
		// o valor precisa estar embrulhado em { lanceValue }, não como string crua
		expect(action.value).toEqual({ lanceValue: 6000 });
	});

	it("lance-embutido: token 'yes'/'no' vira gate 'lance-embutido'", () => {
		expect(
			buildAction("lance-embutido", { value: "yes", label: "Sim, considerar lance embutido" }),
		).toEqual({
			kind: "gate",
			gate: "lance-embutido",
			value: "yes",
			label: "Sim, considerar lance embutido",
		});
		expect(
			gateOf(
				buildAction("lance-embutido", { value: "no", label: "Não, lance com recursos próprios" }),
			).gate,
		).toBe("lance-embutido");
	});

	it("simulator-offer: token 'yes'/'no' vira gate 'simulator-offer'", () => {
		expect(buildAction("simulator-offer", { value: "yes", label: "Quero ver!" })).toEqual({
			kind: "gate",
			gate: "simulator-offer",
			value: "yes",
			label: "Quero ver!",
		});
		expect(gateOf(buildAction("simulator-offer", { value: "no", label: "Agora não" })).gate).toBe(
			"simulator-offer",
		);
	});

	// Gates já corretos antes do bug — guardas de não-regressão.
	it("lance (Sim/Talvez/Não) continua mapeando pro gate 'lance'", () => {
		expect(buildAction("lance", { value: "yes", label: "Sim, tenho reserva" })).toEqual({
			kind: "gate",
			gate: "lance",
			value: "yes",
			label: "Sim, tenho reserva",
		});
	});

	it("experience/timeframe seguem corretos", () => {
		expect(
			gateOf(buildAction("experience", { value: "first", label: "É a primeira vez" })).gate,
		).toBe("experience");
		expect(buildAction("timeframe", { value: "0", label: "O mais rápido possível" })).toEqual({
			kind: "gate",
			gate: "timeframe",
			value: { prazoMeses: 0 },
			label: "O mais rápido possível",
		});
	});
});
