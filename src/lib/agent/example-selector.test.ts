import type { PersonaExample } from "@/db/schema";
import { describe, expect, it } from "vitest";
import { selectExamplesForTurn } from "./example-selector";

// Helper pra criar exemplo com defaults sensatos.
const ex = (id: string, patch: Partial<PersonaExample> = {}): PersonaExample => ({
	id,
	userMessage: "u",
	assistantResponse: "a",
	...patch,
});

describe("selectExamplesForTurn — filtro básico", () => {
	it("inclui exemplo universal (sem when*) com qualquer contexto", () => {
		const result = selectExamplesForTurn([ex("e1")], {});
		expect(result.map((e) => e.id)).toEqual(["e1"]);
	});

	it("exclui exemplo com enabled=false", () => {
		const result = selectExamplesForTurn([ex("e1", { enabled: false })], {});
		expect(result).toEqual([]);
	});

	it("inclui exemplo com enabled=true explicitamente", () => {
		const result = selectExamplesForTurn([ex("e1", { enabled: true })], {});
		expect(result.map((e) => e.id)).toEqual(["e1"]);
	});
});

describe("selectExamplesForTurn — matching por condição", () => {
	it("inclui quando whenExpertise contém o expertise do contexto", () => {
		const e1 = ex("e1", { whenExpertise: ["leigo", "neutro"] });
		const result = selectExamplesForTurn([e1], { expertise: "leigo" });
		expect(result).toEqual([e1]);
	});

	it("exclui quando whenExpertise não contém o expertise do contexto", () => {
		const e1 = ex("e1", { whenExpertise: ["expert"] });
		const result = selectExamplesForTurn([e1], { expertise: "leigo" });
		expect(result).toEqual([]);
	});

	it("exclui quando exemplo exige expertise mas contexto não tem (strict)", () => {
		const e1 = ex("e1", { whenExpertise: ["leigo"] });
		const result = selectExamplesForTurn([e1], {});
		expect(result).toEqual([]);
	});

	it("matching de whenChannel singular", () => {
		const e1 = ex("e1", { whenChannel: "whatsapp" });
		expect(selectExamplesForTurn([e1], { channel: "whatsapp" })).toHaveLength(1);
		expect(selectExamplesForTurn([e1], { channel: "web" })).toHaveLength(0);
		expect(selectExamplesForTurn([e1], {})).toHaveLength(0);
	});

	it("combina múltiplas condições (todas precisam casar)", () => {
		const e1 = ex("e1", { whenExpertise: ["leigo"], whenCategory: ["imovel"] });
		expect(
			selectExamplesForTurn([e1], { expertise: "leigo", category: "imovel" }),
		).toHaveLength(1);
		expect(
			selectExamplesForTurn([e1], { expertise: "leigo", category: "auto" }),
		).toHaveLength(0);
		expect(
			selectExamplesForTurn([e1], { expertise: "expert", category: "imovel" }),
		).toHaveLength(0);
	});
});

describe("selectExamplesForTurn — ranking por especificidade", () => {
	it("exemplos mais específicos vêm antes dos universais", () => {
		const universal = ex("uni");
		const specific = ex("spec", { whenExpertise: ["leigo"] });
		const result = selectExamplesForTurn([universal, specific], { expertise: "leigo" });
		expect(result.map((e) => e.id)).toEqual(["spec", "uni"]);
	});

	it("score = quantidade de condições casadas, mais é melhor", () => {
		const one = ex("one", { whenExpertise: ["leigo"] });
		const two = ex("two", { whenExpertise: ["leigo"], whenCategory: ["imovel"] });
		const three = ex("three", {
			whenExpertise: ["leigo"],
			whenCategory: ["imovel"],
			whenChannel: "whatsapp",
		});
		const result = selectExamplesForTurn([one, two, three], {
			expertise: "leigo",
			category: "imovel",
			channel: "whatsapp",
		});
		expect(result.map((e) => e.id)).toEqual(["three", "two", "one"]);
	});

	it("empate respeita ordem original (estável)", () => {
		const a = ex("a", { whenExpertise: ["leigo"] });
		const b = ex("b", { whenExpertise: ["leigo"] });
		const result = selectExamplesForTurn([a, b], { expertise: "leigo" });
		expect(result.map((e) => e.id)).toEqual(["a", "b"]);
	});
});

describe("selectExamplesForTurn — limit", () => {
	it("usa limit default = 5", () => {
		const examples = Array.from({ length: 10 }, (_, i) => ex(`e${i}`));
		const result = selectExamplesForTurn(examples, {});
		expect(result).toHaveLength(5);
	});

	it("respeita limit customizado", () => {
		const examples = Array.from({ length: 10 }, (_, i) => ex(`e${i}`));
		const result = selectExamplesForTurn(examples, {}, 3);
		expect(result).toHaveLength(3);
	});

	it("limit maior que o disponível retorna todos os matched", () => {
		const result = selectExamplesForTurn([ex("e1"), ex("e2")], {}, 10);
		expect(result).toHaveLength(2);
	});
});

describe("selectExamplesForTurn — cenário realista", () => {
	it("filtra e ranqueia entre 6 exemplos com mix de condições", () => {
		const examples: PersonaExample[] = [
			ex("greet", {}), // universal
			ex("leigo-imovel-cota", {
				whenExpertise: ["leigo"],
				whenCategory: ["imovel"],
				tags: ["jargão"],
			}),
			ex("wpp-short", { whenChannel: "whatsapp" }),
			ex("expert-tone", { whenExpertise: ["expert"] }), // não casa
			ex("asking", { whenIntent: ["asking_question"] }),
			ex("leigo-imovel-wpp", {
				whenExpertise: ["leigo"],
				whenCategory: ["imovel"],
				whenChannel: "whatsapp",
			}),
		];
		const result = selectExamplesForTurn(
			examples,
			{
				expertise: "leigo",
				category: "imovel",
				channel: "whatsapp",
				intent: "asking_question",
			},
			3,
		);
		// Esperado: leigo-imovel-wpp (3 condições) > leigo-imovel-cota (2) > wpp-short (1) e asking (1) - empate, ordem original
		expect(result.map((e) => e.id)).toEqual(["leigo-imovel-wpp", "leigo-imovel-cota", "wpp-short"]);
	});
});
