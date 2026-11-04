import { describe, expect, it } from "vitest";
import { turnoVazio } from "@/lib/playground/simulacao/ler-turno";
import type { TurnoDaSimulacao } from "@/lib/playground/simulacao/tipos";
import { turnoParaMensagens } from "./eventos-para-mensagem";

function turno(extra: Partial<ReturnType<typeof turnoVazio>>): TurnoDaSimulacao {
	return {
		indice: 0,
		cliente: { texto: "oi", origem: "semente" },
		vendedor: { ...turnoVazio(), ...extra },
		duracaoMs: 1,
	};
}

describe("turnoParaMensagens", () => {
	it("artifact vira part data-artifact com type e payload", () => {
		const [, v] = turnoParaMensagens(
			turno({
				baloesFinais: [{ texto: "Olha.", promessa: null }],
				artifacts: [{ artifactType: "comparison_table", payload: { groups: [] }, toolCallId: "t" }],
			}),
			"x",
		);
		const part = v.parts.find((p) => p.type === "data-artifact") as { data: unknown };
		expect(part.data).toEqual({ type: "comparison_table", payload: { groups: [] } });
	});

	it("balões separados viram parts de texto separadas", () => {
		const [u, v] = turnoParaMensagens(turno({ textoDosEventos: ["Um.", "Dois."] }), "x");
		expect(u.role).toBe("user");
		expect(v.parts.filter((p) => p.type === "text")).toHaveLength(2);
	});

	it("turno sem resposta devolve só a fala do cliente", () => {
		expect(turnoParaMensagens(turno({}), "x")).toHaveLength(1);
	});
});
