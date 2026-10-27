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
	for (const chave of Object.keys(process.env)) {
		if (chave.startsWith("LANGFUSE_") || chave === "PI_LANGFUSE_MAX_CHARS")
			delete process.env[chave];
	}
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

	it("o histórico inteiro chega ao provedor, não só a última mensagem", async () => {
		const falso = await servidorFalso([]);
		abertas.push(falso.fechar);
		const { session } = await abrirSessao({
			system: "Você é o consultor.",
			tools: [],
			historico: [
				{ role: "user", content: "Quero comprar um carro." },
				{ role: "assistant", content: "Qual o valor?" },
				{ role: "user", content: "50 mil reais" },
				{ role: "assistant", content: "Para quando?" },
			],
			provider: { id: "fake", baseUrl: `${falso.url}/v1`, apiKey: "x", model: "fake" },
		});
		await session.prompt("300 por mês");
		const enviado = JSON.stringify(falso.pedidos[0]?.messages ?? []);
		expect(enviado).toContain("Quero comprar um carro.");
		expect(enviado).toContain("50 mil reais");
		expect(enviado).toContain("Para quando?");
		expect(enviado).toContain("300 por mês");
	}, 60_000);
});

// D-0014 — O ID DA SESSÃO é o que o Langfuse mostra como `session_id`.
//
// O plugin da observabilidade lê `ctx.sessionManager.getSessionId()`, então a única
// forma de uma CONVERSA ser UMA sessão no Langfuse (e não uma por turno) é o id entrar
// aqui, no `SessionManager`. Estes dois casos são o aceite inteiro:
//   · com as envs ligadas  → o id da sessão É o id da conversa;
//   · sem as envs          → nada muda (id do Pi, como sempre foi).
// Se alguém tirar o `{ id }`, o primeiro caso cai; se alguém passar o id sempre, o
// segundo cai — e o turno passa a depender de observabilidade, que é justamente o
// que não pode acontecer.
describe("pi/sessao — o id da sessão é o da conversa, e só com o Langfuse ligado", () => {
	const CONVERSA = "4a1af177-0a58-4dc4-9d0f-2e5f0f0f6b21";

	it("com as envs do Langfuse, `getSessionId()` devolve o conversationId", async () => {
		const falso = await servidorFalso([]);
		abertas.push(falso.fechar);
		// aponta para o servidor falso: nenhum span sai da máquina
		process.env.LANGFUSE_BASE_URL = falso.url;
		process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-teste";
		process.env.LANGFUSE_SECRET_KEY = "sk-lf-teste";

		const { session } = await abrirSessao({
			system: "Você é o consultor.",
			tools: [],
			conversaId: CONVERSA,
			provider: { id: "fake", baseUrl: `${falso.url}/v1`, apiKey: "x", model: "fake" },
		});

		expect(session.sessionManager.getSessionId()).toBe(CONVERSA);
		// e a extensão do plugin está DE FATO na sessão: ela registra
		// `before_agent_start`, que é onde o trace do turno nasce. Sem isto, o id
		// acima passaria e mesmo assim não haveria trace nenhum.
		expect(session.hasExtensionHandlers("before_agent_start")).toBe(true);
	}, 60_000);

	it("sem as envs, o id é o do próprio Pi — a conversa NÃO vira sessão", async () => {
		const falso = await servidorFalso([]);
		abertas.push(falso.fechar);

		const { session } = await abrirSessao({
			system: "Você é o consultor.",
			tools: [],
			conversaId: CONVERSA,
			provider: { id: "fake", baseUrl: `${falso.url}/v1`, apiKey: "x", model: "fake" },
		});

		expect(session.sessionManager.getSessionId()).not.toBe(CONVERSA);
		// "sem as envs, nenhum efeito" — nem a extensão é carregada
		expect(session.hasExtensionHandlers("before_agent_start")).toBe(false);
	}, 60_000);

	it("com as envs mas id de conversa fora do formato, não estoura o turno", async () => {
		const falso = await servidorFalso([]);
		abertas.push(falso.fechar);
		process.env.LANGFUSE_BASE_URL = falso.url;
		process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-teste";
		process.env.LANGFUSE_SECRET_KEY = "sk-lf-teste";

		const { session } = await abrirSessao({
			system: "Você é o consultor.",
			tools: [],
			conversaId: "id com espaço",
			provider: { id: "fake", baseUrl: `${falso.url}/v1`, apiKey: "x", model: "fake" },
		});

		// o Pi não viu o id ruim (ele lançaria): a sessão caiu no id gerado
		expect(session.sessionManager.getSessionId()).not.toBe("id com espaço");
	}, 60_000);
});
