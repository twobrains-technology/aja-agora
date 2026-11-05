// O turno importa o banco; aqui só interessa a função pura.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

describe("texto antes e depois de uma tool não cola", () => {
	it("abre text-boundary na primeira fala depois da tool, e só ali", async () => {
		const { criarSeparadorDeTrechos } = await import("./turno-livre");
		const sep = criarSeparadorDeTrechos();
		const saida = [...sep.aoDelta("Ótimo conhecer você, Marcos!"), ...sep.aoDelta(" Vamos lá.")];
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

	it("um trecho idêntico a um já solto SAI de novo (P11) e a repetição é medida", async () => {
		const { criarSeparadorDeTrechos } = await import("./turno-livre");
		const sep = criarSeparadorDeTrechos();
		const saida = [...sep.aoDelta("Ótimo! Vou gerar sua proposta agora na Canopus.")];
		sep.aoToolCall();
		// A tool recusou o aceite e o modelo repetiu a mesma frase: o texto SAI (a
		// dedup por conteúdo saiu com o P11) e a repetição é medida.
		saida.push(...sep.aoDelta("Ótimo! Vou gerar sua proposta agora na Canopus."));
		expect(saida.map((e) => e.type)).toEqual(["text-delta", "text-boundary", "text-delta"]);
		expect(saida[2]).toMatchObject({
			type: "text-delta",
			text: "Ótimo! Vou gerar sua proposta agora na Canopus.",
		});
		expect(sep.duplicatasNoTurno()).toBe(1);
	});
});

describe("conversa picada: cada bolha abre a própria fronteira", () => {
	it("aoNovoBalao faz o próximo delta abrir text-boundary, e só ele", async () => {
		const { criarSeparadorDeTrechos } = await import("./turno-livre");
		const sep = criarSeparadorDeTrechos();
		const saida = [...sep.aoDelta("Lance é um valor que você oferece.")];
		// O balão anterior fechou porque era OUTRA bolha do mesmo trecho: sem a fronteira, as
		// bolhas colavam de volta num bloco só (prints 07/08).
		sep.aoNovoBalao();
		saida.push(...sep.aoDelta("Há dois tipos."));
		sep.aoNovoBalao();
		saida.push(...sep.aoDelta("Você tem algum valor guardado?"));
		expect(saida.map((e) => e.type)).toEqual([
			"text-delta",
			"text-boundary",
			"text-delta",
			"text-boundary",
			"text-delta",
		]);
	});
});
