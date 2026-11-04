import type { AjaUIMessage } from "@/lib/chat/ui-message";

type Parte = { type: "text"; text: string } | { type: "data-artifact"; data: unknown };

/** Estado do turno do vendedor enquanto o NDJSON chega. `aberto` = o último
 * balão ainda recebe `text-delta`; `text-boundary` fecha. */
export interface EstadoDaMensagem {
	id: string;
	parts: Parte[];
	aberto: boolean;
	erro?: boolean;
	conversationId?: string;
}

export function estadoInicial(id: string): EstadoDaMensagem {
	return { id, parts: [], aberto: false };
}

/** Aplica uma linha NDJSON do servidor. Ordem do stream = ordem das partes. */
export function aplicarEvento(
	estado: EstadoDaMensagem,
	linha: Record<string, unknown>,
): EstadoDaMensagem {
	switch (linha.type) {
		case "inicio":
			return typeof linha.conversationId === "string"
				? { ...estado, conversationId: linha.conversationId }
				: estado;
		case "evento": {
			const ev = linha.evento as Record<string, unknown> | undefined;
			if (ev?.type === "text-delta" && typeof ev.text === "string") {
				const ultima = estado.parts[estado.parts.length - 1];
				if (estado.aberto && ultima?.type === "text") {
					const parts = [...estado.parts.slice(0, -1), { ...ultima, text: ultima.text + ev.text }];
					return { ...estado, parts };
				}
				return {
					...estado,
					aberto: true,
					parts: [...estado.parts, { type: "text", text: ev.text }],
				};
			}
			if (ev?.type === "text-boundary") return { ...estado, aberto: false };
			if (ev?.type === "artifact" && typeof ev.artifactType === "string") {
				return {
					...estado,
					aberto: false,
					parts: [
						...estado.parts,
						{ type: "data-artifact", data: { type: ev.artifactType, payload: ev.payload ?? {} } },
					],
				};
			}
			return estado;
		}
		case "final": {
			const baloes = Array.isArray(linha.baloes) ? (linha.baloes as { texto?: unknown }[]) : [];
			const textos = baloes.map((b) => b.texto).filter((t): t is string => typeof t === "string");
			const conversationId =
				typeof linha.conversationId === "string" ? linha.conversationId : estado.conversationId;
			const nTextos = estado.parts.filter((p) => p.type === "text").length;
			let parts: Parte[];
			if (nTextos === textos.length) {
				let i = 0;
				parts = estado.parts.map((p) =>
					p.type === "text" ? { type: "text", text: textos[i++] } : p,
				);
			} else {
				parts = [
					...textos.map((text): Parte => ({ type: "text", text })),
					...estado.parts.filter((p) => p.type === "data-artifact"),
				];
			}
			return { ...estado, parts, aberto: false, conversationId };
		}
		case "erro":
			return {
				...estado,
				aberto: false,
				erro: true,
				parts: [{ type: "text", text: typeof linha.error === "string" ? linha.error : "Erro" }],
			};
		default:
			return estado;
	}
}

export function paraMensagem(estado: EstadoDaMensagem): AjaUIMessage {
	return { id: estado.id, role: "assistant", parts: estado.parts } as unknown as AjaUIMessage;
}
