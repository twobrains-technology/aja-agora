// Mapeia o turno lido do NDJSON (`TurnoDaSimulacao`) para mensagens da UI do chat, só para leitura.
import type { AjaUIMessage, ArtifactPartData } from "@/lib/chat/ui-message";
import type { TurnoDaSimulacao } from "@/lib/playground/simulacao/tipos";

/** Balões do vendedor: o `final` do servidor manda; sem ele valem os balões montados do stream. */
export function baloesDoVendedor(t: TurnoDaSimulacao): string[] {
	const finais = t.vendedor.baloesFinais.map((b) => b.texto).filter((x) => x.trim() !== "");
	return finais.length > 0 ? finais : t.vendedor.textoDosEventos;
}

export function turnoParaMensagens(t: TurnoDaSimulacao, idBase: string): AjaUIMessage[] {
	const usuario = {
		id: `${idBase}-cliente`,
		role: "user",
		parts: [{ type: "text", text: t.cliente.texto }],
	} as unknown as AjaUIMessage;

	const parts: unknown[] = [
		...baloesDoVendedor(t).map((text) => ({ type: "text", text })),
		...t.vendedor.artifacts.map((a) => ({
			type: "data-artifact",
			data: { type: a.artifactType, payload: a.payload } as unknown as ArtifactPartData,
		})),
	];
	if (parts.length === 0) return [usuario];

	const vendedor = {
		id: `${idBase}-vendedor`,
		role: "assistant",
		parts,
	} as unknown as AjaUIMessage;
	return [usuario, vendedor];
}
