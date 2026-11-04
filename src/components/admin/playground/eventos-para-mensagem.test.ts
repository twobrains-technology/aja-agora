import { describe, expect, it } from "vitest";
import { aplicarEvento, estadoInicial, paraMensagem } from "./eventos-para-mensagem";

const delta = (text: string) => ({ type: "evento", evento: { type: "text-delta", text } });
const fronteira = { type: "evento", evento: { type: "text-boundary" } };
const artifact = (artifactType?: string) => ({
	type: "evento",
	evento: { type: "artifact", artifactType, payload: { groups: [] }, toolCallId: "t1" },
});

function rodar(linhas: Record<string, unknown>[]) {
	return paraMensagem(linhas.reduce(aplicarEvento, estadoInicial("m1")));
}

describe("eventos-para-mensagem", () => {
	it("texto → artifact → texto vira 3 partes na ordem", () => {
		const m = rodar([delta("Veja"), artifact("comparison_table"), delta("O que acha?")]);
		expect(m.parts.map((p) => p.type)).toEqual(["text", "data-artifact", "text"]);
		expect((m.parts[0] as { text: string }).text).toBe("Veja");
		expect((m.parts[1] as { data: { type: string } }).data.type).toBe("comparison_table");
		expect((m.parts[2] as { text: string }).text).toBe("O que acha?");
	});

	it("dois text-boundary viram dois balões", () => {
		const m = rodar([delta("Oi"), fronteira, delta("tudo bem?"), fronteira, delta("e você?")]);
		expect(m.parts.map((p) => (p as { text: string }).text)).toEqual([
			"Oi",
			"tudo bem?",
			"e você?",
		]);
	});

	it("deltas seguidos sem fronteira ficam no mesmo balão", () => {
		const m = rodar([delta("Oi, "), delta("tudo")]);
		expect(m.parts).toHaveLength(1);
		expect((m.parts[0] as { text: string }).text).toBe("Oi, tudo");
	});

	it("artifact sem artifactType é ignorado; tool-call também", () => {
		const m = rodar([
			artifact(undefined),
			{ type: "evento", evento: { type: "tool-call", toolName: "x" } },
			delta("Oi"),
		]);
		expect(m.parts.map((p) => p.type)).toEqual(["text"]);
	});

	it("final mantém os artifacts e sobrescreve o texto", () => {
		const m = rodar([
			delta("rascunho"),
			artifact("comparison_table"),
			{ type: "final", baloes: [{ texto: "Texto final" }] },
		]);
		expect(m.parts.some((p) => p.type === "data-artifact")).toBe(true);
		expect(
			m.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text),
		).toEqual(["Texto final"]);
	});

	it("erro vira balão marcado", () => {
		const e = [{ type: "erro", error: "quebrou" }].reduce(aplicarEvento, estadoInicial("m1"));
		expect(e.erro).toBe(true);
		expect((paraMensagem(e).parts[0] as { text: string }).text).toBe("quebrou");
	});
});
