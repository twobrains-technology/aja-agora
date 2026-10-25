import { describe, expect, it } from "vitest";

// O turno importa o banco; aqui só interessa a função pura.
import { vi } from "vitest";
vi.mock("@/db", () => ({ db: {} }));

describe("texto antes e depois de uma tool não cola", () => {
	it("abre text-boundary na primeira fala depois da tool, e só ali", async () => {
		const { criarSeparadorDeTrechos } = await import("./turno-livre");
		const sep = criarSeparadorDeTrechos();
		const saida = [
			...sep.aoDelta("Ótimo conhecer você, Marcos!"),
			...sep.aoDelta(" Vamos lá."),
		];
		sep.aoToolCall();
		saida.push(...sep.aoDelta("Então Marcos"), ...sep.aoDelta(", achei 4."));
		expect(saida.map((e) => e.type)).toEqual([
			"text-delta",
			"text-delta",
			"text-boundary",
			"text-delta",
			"text-delta",
		]);
	});

	it("tool antes de qualquer fala não abre boundary à toa", async () => {
		const { criarSeparadorDeTrechos } = await import("./turno-livre");
		const sep = criarSeparadorDeTrechos();
		sep.aoToolCall();
		expect(sep.aoDelta("Achei 4.").map((e) => e.type)).toEqual(["text-delta"]);
	});
});
