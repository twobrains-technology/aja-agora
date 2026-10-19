import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Tool as AiSdkTool } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { abrirSessao } from "./sessao";
import { toPiTool } from "./tools";

/** Servidor OpenAI-completions FALSO — mede o harness, não o modelo. Ele
 * responde em duas idas: primeiro pede a tool, depois escreve o texto. */
async function servidorFalso(chamadas: Array<{ role: string; content?: unknown }>) {
	const pedidos: Array<{ messages?: Array<{ role: string; content?: unknown }> }> = [];
	const server = createServer((req, res) => {
		let corpo = "";
		req.on("data", (c) => {
			corpo += c;
		});
		req.on("end", () => {
			const pedido = JSON.parse(corpo || "{}");
			pedidos.push(pedido);
			const jaPediuTool = JSON.stringify(pedido.messages ?? []).includes("tool_call_id");
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			const envia = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
			const base = {
				id: "chatcmpl-fake",
				object: "chat.completion.chunk",
				created: 0,
				model: "fake",
			};
			if (!jaPediuTool) {
				envia({
					...base,
					choices: [
						{
							index: 0,
							delta: {
								role: "assistant",
								tool_calls: [
									{
										index: 0,
										id: "call_fake_1",
										type: "function",
										function: { name: "registrar_valor", arguments: '{"valor":80000}' },
									},
								],
							},
						},
					],
				});
				envia({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
			} else {
				envia({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" } }] });
				for (const pedaco of ["Valor registrado. ", "Seguimos."]) {
					envia({ ...base, choices: [{ index: 0, delta: { content: pedaco } }] });
				}
				envia({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
			}
			res.write("data: [DONE]\n\n");
			res.end();
		});
	});
	await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
	const porta = (server.address() as AddressInfo).port;
	chamadas.push(...[]);
	return {
		url: `http://127.0.0.1:${porta}`,
		pedidos,
		fechar: () => server.close(),
	};
}

const abertas: Array<() => void> = [];
afterEach(() => {
	for (const f of abertas.splice(0)) f();
});

describe("pi/sessao — a sessão do turno é montada em controle total", () => {
	it("roda uma tool de negócio e devolve texto, sem nenhuma tool de código", async () => {
		const chamadas: Array<{ role: string; content?: unknown }> = [];
		const falso = await servidorFalso(chamadas);
		abertas.push(falso.fechar);

		const recebidos: unknown[] = [];
		const toolDoNegocio = {
			description: "registra o valor que o cliente pediu",
			inputSchema: z.object({ valor: z.number() }),
			execute: async (input: { valor: number }) => {
				recebidos.push(input);
				return { ok: true };
			},
		} as unknown as AiSdkTool;

		const { session } = await abrirSessao({
			system: "Você é o consultor do Aja Agora.",
			tools: [toPiTool("registrar_valor", toolDoNegocio)],
			provider: { id: "fake", baseUrl: `${falso.url}/v1`, apiKey: "x", model: "fake" },
		});

		const ativas = session.getActiveToolNames();
		expect(ativas).toContain("registrar_valor");
		for (const proibida of ["read", "bash", "edit", "write", "grep", "find", "ls"]) {
			expect(ativas).not.toContain(proibida);
		}

		const texto: string[] = [];
		session.subscribe(
			(ev: { type: string; assistantMessageEvent?: { type: string; delta?: string } }) => {
				if (ev.type === "message_update" && ev.assistantMessageEvent?.type === "text_delta") {
					texto.push(ev.assistantMessageEvent.delta ?? "");
				}
			},
		);

		await session.prompt("o cliente quer um carro de 80 mil");

		// a tool EXECUTOU com o valor que o modelo mandou
		expect(recebidos).toEqual([{ valor: 80000 }]);
		// e o texto do modelo chegou por streaming
		expect(texto.join("")).toContain("Valor registrado");
		// duas idas ao provedor: a que pede a tool e a que conclui
		expect(falso.pedidos.length).toBeGreaterThanOrEqual(2);
	}, 60_000);
});
