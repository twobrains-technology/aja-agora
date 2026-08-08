// Tap de writer SSE que acumula os text-delta do turno — a fala final do
// agente vira o `output` do trace Langfuse. Mesmo padrão de Proxy do
// instrumentWriter (turn-trace.ts): passthrough transparente, zero mudança
// de contrato pra quem escreve.
import type { UIMessageStreamWriter } from "ai";
import type { AjaUIMessage } from "@/lib/chat/ui-message";

export function collectAgentText(writer: UIMessageStreamWriter<AjaUIMessage>): {
	writer: UIMessageStreamWriter<AjaUIMessage>;
	getText: () => string;
} {
	let text = "";
	const proxied = new Proxy(writer, {
		get(target, prop, receiver) {
			if (prop === "write") {
				return (part: { type?: string; delta?: unknown }) => {
					if (part?.type === "text-delta" && typeof part.delta === "string") {
						text += part.delta;
					}
					return target.write(part as Parameters<typeof target.write>[0]);
				};
			}
			return Reflect.get(target, prop, receiver);
		},
	});
	return { writer: proxied, getText: () => text };
}
