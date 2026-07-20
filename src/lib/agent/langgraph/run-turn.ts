import type { TurnEvent, TurnInput } from "@/lib/agent/orchestrator/types";

// STUB (FIX-355) — contrato + implementação real chegam no FIX-357 (tipos) e
// FIX-358 (grafo mínimo end-to-end). Existe já pra o dispatcher (`runTurn`,
// orchestrator/index.ts) ter algo importável e type-safe desde já.
export async function* runTurnLangGraph(_input: TurnInput): AsyncGenerator<TurnEvent> {
	throw new Error(
		"[runTurnLangGraph] ainda não implementado nesta rodada — ver FIX-357/FIX-358 (bloco-fundacao-langgraph).",
	);
}
