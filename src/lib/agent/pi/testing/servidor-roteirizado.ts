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
import type { ScriptedBeat } from "@/lib/agent/langgraph/testing/scripted-model";

export type ServidorRoteirizado = {
	url: string;
	/** Quantas chamadas o harness já fez (útil em asserção de "não chamou"). */
	chamadas: () => number;
	fechar: () => Promise<void>;
};

export async function subirServidorRoteirizado(
	beats: readonly ScriptedBeat[],
): Promise<ServidorRoteirizado> {
	let i = 0;
	const server: Server = createServer((req, res) => {
		let corpo = "";
		req.on("data", (c) => {
			corpo += c;
		});
		req.on("end", () => {
			const beat = beats[i] ?? { text: "" };
			i += 1;
			// Consome o corpo para o socket não travar em request seguinte.
			void corpo;
			res.writeHead(200, { "Content-Type": "text/event-stream" });
			const envia = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
			const base = {
				id: `chatcmpl-cenario-${i}`,
				object: "chat.completion.chunk",
				created: 0,
				model: "cenario",
			};

			if (beat.toolCalls?.length) {
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
			res.write("data: [DONE]\n\n");
			res.end();
		});
	});

	await new Promise<void>((ok) => server.listen(0, "127.0.0.1", () => ok()));
	const porta = (server.address() as AddressInfo).port;
	return {
		url: `http://127.0.0.1:${porta}`,
		chamadas: () => i,
		fechar: () =>
			new Promise<void>((ok) => {
				server.close(() => ok());
			}),
	};
}
