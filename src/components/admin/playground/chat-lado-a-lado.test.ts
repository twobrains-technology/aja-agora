import { describe, expect, it } from "vitest";
import { aplicarLinha, type EstadoDoTurno } from "./chat-lado-a-lado";

function rodar(linhas: Record<string, unknown>[]): EstadoDoTurno {
	return linhas.reduce<EstadoDoTurno>((s, l) => aplicarLinha(s, l), { texto: "" });
}

describe("aplicarLinha", () => {
	it("monta os balões: inicio → delta → boundary → delta → final", () => {
		const parcial = rodar([
			{ type: "inicio", conversationId: "c1", modo: "antes", caixaVersao: 1 },
			{ type: "evento", evento: { type: "text-delta", text: "Oi" } },
			{ type: "evento", evento: { type: "text-boundary" } },
			{ type: "evento", evento: { type: "text-delta", text: "tudo bem?" } },
		]);
		expect(parcial.texto).toBe("Oi\n\ntudo bem?");
		expect(parcial.conversationId).toBe("c1");
		const final = aplicarLinha(parcial, {
			type: "final",
			conversationId: "c1",
			baloes: [
				{ texto: "Oi", promessa: false },
				{ texto: "tudo bem?", promessa: false },
			],
		});
		expect(final.texto).toBe("Oi\n\ntudo bem?");
		expect(final.erro).toBeFalsy();
	});

	it("linha de erro devolve o error com a flag", () => {
		const s = rodar([{ type: "erro", error: "quebrou" }]);
		expect(s.texto).toBe("quebrou");
		expect(s.erro).toBe(true);
	});
});
