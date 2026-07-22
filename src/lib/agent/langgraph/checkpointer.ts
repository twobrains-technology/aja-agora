// Checkpointer do grafo LangGraph — persiste o estado por `thread_id =
// conversationId`, o que faz o `interrupt()` funcionar ENTRE turnos (o grafo
// pausa no ponto de coleta e o próximo turno resume daquele ponto).
//
// URGÊNCIA (2026-07-20): usando MemorySaver (in-memory, dentro do processo) em
// vez do PostgresSaver — o `pg` nativo do PostgresSaver quebrava o bundling do
// Turbopack na /api/chat ("Could not parse module db/schema.ts"). MemorySaver
// não tem dep nativa. Trade-off: o estado do interrupt some no restart do
// container (aceitável em dev/validação; uma conversa em andamento recomeça).
// TODO(prod): PostgresSaver com `pg` em serverExternalPackages do next.config,
// pra durabilidade real entre instâncias/deploys.
import { MemorySaver } from "@langchain/langgraph";

let _saver: MemorySaver | null = null;

export async function getCheckpointer(): Promise<MemorySaver> {
	if (!_saver) _saver = new MemorySaver();
	return _saver;
}
