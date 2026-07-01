// FIX-179 (Mirella, 2026-07-01 — "quero ver todos" → decision_prompt pra
// Embracon, grupo NUNCA exibido): a IA pulou pra simulate_quota/get_group_
// details/present_decision_prompt sobre um grupo real da Bevi que só existia
// no discovery cache, sem NUNCA ter aparecido em tela pro usuário. Trava:
// essas tools só podem operar sobre grupo cujo id/administradora já foi
// EXIBIDO (comparison_table/group_card/recommendation_card/simulation_result).
import { describe, expect, it } from "vitest";
import { extractShownFromPayload } from "./shown-groups";

describe("FIX-179 — extractShownFromPayload (o que já foi exibido em tela)", () => {
	it("group_card: extrai id + administradora", () => {
		const result = extractShownFromPayload("group_card", {
			id: "6a0ca9ca1b2c3d4e5f607182",
			administradora: "ITAÚ",
		});
		expect(result.ids).toEqual(["6a0ca9ca1b2c3d4e5f607182"]);
		expect(result.administradoras).toEqual(["ITAÚ"]);
	});

	it("comparison_table: extrai TODOS os grupos do array", () => {
		const result = extractShownFromPayload("comparison_table", {
			groups: [
				{ id: "id-1", administradora: "ITAÚ" },
				{ id: "id-2", administradora: "RODOBENS" },
				{ id: "id-3", administradora: "CANOPUS" },
			],
		});
		expect(result.ids).toEqual(["id-1", "id-2", "id-3"]);
		expect(result.administradoras).toEqual(["ITAÚ", "RODOBENS", "CANOPUS"]);
	});

	it("recommendation_card: extrai id + administradora", () => {
		const result = extractShownFromPayload("recommendation_card", {
			id: "rec-1",
			administradora: "ÂNCORA",
			score: 0.9,
		});
		expect(result.ids).toEqual(["rec-1"]);
		expect(result.administradoras).toEqual(["ÂNCORA"]);
	});

	it("simulation_result: usa groupId (NÃO id) + administradora", () => {
		const result = extractShownFromPayload("simulation_result", {
			groupId: "sim-1",
			administradora: "BRADESCO",
			monthlyPayment: 1200,
		});
		expect(result.ids).toEqual(["sim-1"]);
		expect(result.administradoras).toEqual(["BRADESCO"]);
	});

	it("tipo desconhecido (ex: decision_prompt, lead_form) → não extrai nada, não quebra", () => {
		const result = extractShownFromPayload("decision_prompt", { administradora: "Embracon" });
		expect(result.ids).toEqual([]);
		expect(result.administradoras).toEqual([]);
	});

	it("payload malformado (null, array, sem campos) → não quebra, devolve vazio", () => {
		expect(extractShownFromPayload("group_card", null)).toEqual({ ids: [], administradoras: [] });
		expect(extractShownFromPayload("comparison_table", {})).toEqual({
			ids: [],
			administradoras: [],
		});
		expect(extractShownFromPayload("comparison_table", { groups: "não é array" })).toEqual({
			ids: [],
			administradoras: [],
		});
	});

	it("comparison_table com item sem id/administradora → pula esse item, mantém os outros", () => {
		const result = extractShownFromPayload("comparison_table", {
			groups: [{ id: "id-1", administradora: "ITAÚ" }, { foo: "bar" }, { id: "id-2" }],
		});
		expect(result.ids).toEqual(["id-1", "id-2"]);
		expect(result.administradoras).toEqual(["ITAÚ"]);
	});
});
