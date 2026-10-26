// SERVIDOR ROTEIRIZADO — o "modelo" dos cenários do pi.
//
// Nos cenários do grafo o modelo era o `ScriptedChatModel` (objeto LangChain). O
// pi fala OpenAI-completions por HTTP, então o roteiro vira um servidor local
// que responde os beats na ordem — mesma ideia, mesmo contrato: o cenário lê
// como um roteiro e a asserção é sobre a TRAJETÓRIA (quais cards, qual gate),
// nunca sobre a prosa.
//
// Beats acabados devolvem texto vazio sem tool: isso encerra o laço do harness
// sem estourar nada (equivalente ao `fallback` do ScriptedChatModel).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
/** Um beat do roteiro: ou texto, ou uma rodada de tool-calls. */
export type ScriptedBeat = {
	text?: string;
	toolCalls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
	/** O bloco `usage` final que o provedor manda — é de onde saem os tokens (e o
	 * recorte de cache do prompt) do livro-caixa do turno. Sem ele o provedor não
	 * reporta nada, que é o que a maioria dos cenários quer. */
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		cacheRead?: number;
		cacheWrite?: number;
	};
};

export type ServidorRoteirizado = {
	url: string;
	/** O system que o MODELO recebeu na última ida (texto achatado). */
	ultimoSistema: () => string;
	/** Quantas chamadas o harness já fez (útil em asserção de "não chamou"). */
	chamadas: () => number;
	fechar: () => Promise<void>;
};

export async function subirServidorRoteirizado(
	beats: readonly ScriptedBeat[],
): Promise<ServidorRoteirizado> {
	let i = 0;
	let ultimoSistema = "";
	const server: Server = createServer((req, res) => {
		let corpo = "";
		req.on("data", (c) => {
			corpo += c;
		});
		req.on("end", () => {
			const beat = beats[i] ?? { text: "" };
			i += 1;
			// Guarda o system que o modelo recebeu — é o que prova que a CAIXA
			// governa o turno (o teste da caixa lê isto, não o objeto do modelo).
			try {
				const pedido = JSON.parse(corpo || "{}") as {
					messages?: Array<{ role?: string; content?: unknown }>;
				};
				const sistema = pedido.messages?.find((m) => m.role === "system")?.content;
				ultimoSistema =
					typeof sistema === "string"
						? sistema
						: Array.isArray(sistema)
							? sistema
									.map((b) => (b && typeof b === "object" && "text" in b ? String(b.text) : ""))
									.join("\n")
							: "";
			} catch {
				// corpo estranho não derruba o cenário
			}
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			const envia = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
			const base = {
				id: `chatcmpl-cenario-${i}`,
				object: "chat.completion.chunk",
				created: 0,
				model: "cenario",
			};

			if (beat.toolCalls?.length) {
				// A fala ANTES da ferramenta vem na MESMA mensagem do tool_call — é
				// assim que o provedor entrega ("deixa eu ver…" e a chamada no mesmo
				// turno do modelo), e é o caso que a ordem dos cards precisa acertar.
				if (beat.text) {
					envia({
						...base,
						choices: [{ index: 0, delta: { role: "assistant", content: beat.text } }],
					});
				}
				envia({
					...base,
					choices: [
						{
							index: 0,
							delta: {
								role: "assistant",
								tool_calls: beat.toolCalls.map((t, n) => ({
									index: n,
									id: t.id ?? `call_${i}_${n}`,
									type: "function",
									function: { name: t.name, arguments: JSON.stringify(t.args ?? {}) },
								})),
							},
						},
					],
				});
				envia({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
			} else {
				envia({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" } }] });
				if (beat.text) {
					envia({ ...base, choices: [{ index: 0, delta: { content: beat.text } }] });
				}
				envia({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
			}
			// O bloco `usage` final (chunk sem `choices`) — só quando o cenário pede:
			// é a única forma de o harness saber quantos tokens do prompt vieram do
			// cache, e sem `prompt_tokens_details` o provedor não reporta cache.
			if (beat.usage) {
				envia({
					...base,
					choices: [],
					usage: {
						prompt_tokens: beat.usage.prompt_tokens,
						completion_tokens: beat.usage.completion_tokens,
						...(beat.usage.cacheRead !== undefined || beat.usage.cacheWrite !== undefined
							? {
									prompt_tokens_details: {
										cached_tokens: beat.usage.cacheRead ?? 0,
										cache_write_tokens: beat.usage.cacheWrite ?? 0,
									},
								}
							: {}),
					},
				});
			}
			res.write("data: [DONE]\n\n");
			res.end();
		});
	});

	await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
	const porta = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${porta}`,
		ultimoSistema: () => ultimoSistema,
		chamadas: () => i,
		fechar: () =>
			new Promise<void>((ok) => {
				server.close(() => ok());
			}),
	};
}
