import { describe, expect, it } from "vitest";
import { aplicarLinhaNdjson, lerTurno, turnoVazio } from "./ler-turno";

function stream(linhas: string[], status = 200): Response {
	return new Response(linhas.join("\n"), { status });
}

const ev = (evento: Record<string, unknown>) => JSON.stringify({ type: "evento", evento });

describe("lerTurno", () => {
	it("monta o TurnoLido de um stream completo", async () => {
		const dados = { fonteDeDados: "duble", catalogo: "padrao", fila: { atendentes: 2 } };
		const resp = stream([
			JSON.stringify({ type: "inicio", conversationId: "c1", dados, caixaVersao: 7 }),
			ev({ type: "text-delta", text: "Oi, " }),
			ev({ type: "text-delta", text: "tudo bem?" }),
			ev({ type: "text-boundary" }),
			ev({ type: "tool-call", toolName: "mostrar_card", input: { tipo: "x" }, toolCallId: "t1" }),
			ev({
				type: "artifact",
				artifactType: "comparison_table",
				payload: { a: 1 },
				toolCallId: "t1",
			}),
			ev({ type: "finish", reason: "complete" }),
			JSON.stringify({
				type: "final",
				conversationId: "c1",
				baloes: [{ texto: "Oi, tudo bem?", promessa: null }],
			}),
			"",
		]);
		const t = await lerTurno(resp);
		expect(t).toEqual({
			conversationId: "c1",
			dadosEcoados: dados,
			caixaVersao: 7,
			textoDosEventos: ["Oi, tudo bem?"],
			baloesFinais: [{ texto: "Oi, tudo bem?", promessa: null }],
			toolCalls: [{ toolName: "mostrar_card", input: { tipo: "x" }, toolCallId: "t1" }],
			artifacts: [{ artifactType: "comparison_table", payload: { a: 1 }, toolCallId: "t1" }],
			finish: { reason: "complete" },
			erro: null,
			finalRecebido: true,
			linhasInvalidas: 0,
			httpStatus: 200,
		});
	});

	it("separa balões no text-boundary", async () => {
		const t = await lerTurno(
			stream([
				ev({ type: "text-delta", text: "Um." }),
				ev({ type: "text-boundary" }),
				ev({ type: "text-delta", text: "Dois." }),
			]),
		);
		expect(t.textoDosEventos).toEqual(["Um.", "Dois."]);
	});

	it("conta linha truncada como inválida", async () => {
		const t = await lerTurno(
			stream([ev({ type: "text-delta", text: "ok" }), '{"type":"evento","ev']),
		);
		expect(t.linhasInvalidas).toBe(1);
		expect(t.textoDosEventos).toEqual(["ok"]);
	});

	it("resposta !ok vira erro com httpStatus", async () => {
		const t = await lerTurno(new Response("nope", { status: 502 }));
		expect(t.erro).toBe("HTTP 502");
		expect(t.httpStatus).toBe(502);
		expect(t.finalRecebido).toBe(false);
	});

	it("stream cortado sem final deixa finalRecebido=false", async () => {
		const t = await lerTurno(stream([ev({ type: "text-delta", text: "meio" })]));
		expect(t.finalRecebido).toBe(false);
		expect(t.baloesFinais).toEqual([]);
	});

	it("linha erro preenche erro", async () => {
		const t = await lerTurno(stream([JSON.stringify({ type: "erro", error: "O turno falhou." })]));
		expect(t.erro).toBe("O turno falhou.");
	});

	it("ignora eco de dados malformado", () => {
		const t = aplicarLinhaNdjson(turnoVazio(), { type: "inicio", dados: { fonteDeDados: "x" } });
		expect(t.dadosEcoados).toBeNull();
	});
});
