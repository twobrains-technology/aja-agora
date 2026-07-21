// Nó `emitCard` — traduz a decisão de rota (`state.gate`, calculada pelo nó
// `route`) em `TurnEvent`s determinísticos: o evento `gate` (pro input
// estruturado do gate ativo) e, quando o funil chegou em "decision", o card
// `decision_prompt` — via `buildDecisionPromptCard` (server-cards.ts), a
// MESMA emissão server-side determinística do runtime Vercel
// (`dispatchDecisionCascade`/`emitServerCard`, crítico "tool sumida").
//
// TODO(rodada-1): os demais cards do funil completo (scarcity, two_paths,
// contract_form, etc. — ITEM E do goal doc) entram aqui conforme os nós de
// funil completos (ITEM D) forem cobrindo mais gates.
//
// NÃO empurra via `config.writer` (mesma nota de `discovery.ts`) — "gate"
// dispara `reloadMeta` fresco no adapter (web/adapter.ts:308); só é seguro
// entregar depois que `persist` gravar. `run-turn.ts` drena do estado final.
import { buildDecisionPromptCard } from "@/lib/agent/orchestrator/server-cards";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType } from "../state";

export function emitCardNode(state: AgentGraphStateType): Partial<AgentGraphStateType> {
	const events: TurnEvent[] = [];
	let funnel = state.funnel;

	if (state.gate) {
		// TODO(rodada-1): `modelAsked` real — precisa saber se a fala do
		// `converse` deste turno já fez a pergunta do gate (heurística do
		// runner Vercel, `discardHeldQuestion`/ADR revoga-jornada-soberana).
		// Nesta fundação sempre `false` — o adapter web/WhatsApp então injeta a
		// pergunta canônica (`gateQuestion`) junto do card, comportamento
		// seguro (nunca cala a pergunta), só não-otimizado ainda.
		events.push({ type: "gate", gate: state.gate, modelAsked: false });
	}

	if (state.gate === "decision" && !funnel.decisionDispatched) {
		const meta = projectToMeta(state);
		const card = buildDecisionPromptCard(meta);
		events.push({ type: "text-boundary" });
		events.push({
			type: "artifact",
			artifactType: "decision_prompt",
			payload: card.payload,
			toolCallId: crypto.randomUUID(),
		});
		funnel = { ...funnel, decisionDispatched: true };
	}

	return { funnel, events };
}
