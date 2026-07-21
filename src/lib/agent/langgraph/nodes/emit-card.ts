// Nó `emitCard` — traduz a decisão de rota (`state.gate`, calculada pelo nó
// `route`) em `TurnEvent`s determinísticos: o evento `gate` (pro input
// estruturado do gate ativo) + os cards server-side da coreografia
// (FIX-360/361) — sempre via builder determinístico (`server-cards.ts`),
// NUNCA dependente de tool-call do LLM (crítico "tool sumida",
// FIX-246/253/280/309).
//
// TODO(rodada-2): `contract_form`/`real_offer`/cerimônia de fechamento —
// fora do escopo desta rodada (fork de pesquisa: sem lógica visível além do
// disparo do contract_form em index.ts; tratar como funil de PÓS-venda).
//
// NÃO empurra via `config.writer` (mesma nota de `discovery.ts`) — "gate"
// dispara `reloadMeta` fresco no adapter (web/adapter.ts:308); só é seguro
// entregar depois que `persist` gravar. `run-turn.ts` drena do estado final.
import {
	buildDecisionPromptCard,
	buildEmbeddedBidCard,
	buildScarcityCard,
	buildTopicPickerCard,
	buildTwoPathsCard,
} from "@/lib/agent/orchestrator/server-cards";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType } from "../state";

export function emitCardNode(state: AgentGraphStateType): Partial<AgentGraphStateType> {
	const events: TurnEvent[] = [];
	let funnel = state.funnel;

	if (state.gate) {
		// TODO(rodada-2): `modelAsked` real — precisa saber se a fala do
		// `converse` deste turno já fez a pergunta do gate (heurística do
		// runner Vercel, `discardHeldQuestion`/ADR revoga-jornada-soberana).
		// Sempre `false` — o adapter web/WhatsApp então injeta a pergunta
		// canônica (`gateQuestion`) junto do card, comportamento seguro (nunca
		// cala a pergunta), só não-otimizado ainda.
		events.push({ type: "gate", gate: state.gate, modelAsked: false });
	}

	// FIX-360 — `topic_picker`: card ÚNICO pro usuário novato, assim que
	// `experience` resolve (experiencePrev==="first") — independente do gate
	// ativo NESTE turno. `topicPickerDispatched` garante emissão única; sem
	// janela adicional contra `recoConsentDispatched` (diferente do runtime
	// Vercel) porque neste grafo `experience`→`reco-consent` podem resolver
	// no MESMO turno (analyze funde `experiencePrev` antes de `route`
	// computar o próximo gate) — a janela do Vercel nunca seria alcançável
	// aqui.
	if (funnel.experiencePrev === "first" && !funnel.topicPickerDispatched) {
		events.push({
			type: "artifact",
			artifactType: "topic_picker",
			payload: buildTopicPickerCard().payload,
			toolCallId: crypto.randomUUID(),
		});
		funnel = { ...funnel, topicPickerDispatched: true };
	}

	// FIX-360 — `embedded_bid`: educação + opt-in do lance embutido, emitido
	// enquanto o gate segue sem resposta (o nó `advance` já consome a
	// resposta de texto livre ANTES deste nó rodar — sem loop, FIX-260).
	if (state.gate === "lance-embutido" && funnel.qualifyAnswers.lanceEmbutido === undefined) {
		const meta = projectToMeta({ ...state, funnel });
		events.push({ type: "text-boundary" });
		events.push({
			type: "artifact",
			artifactType: "embedded_bid",
			payload: buildEmbeddedBidCard(meta).payload,
			toolCallId: crypto.randomUUID(),
		});
	}

	if (state.gate === "decision" && !funnel.decisionDispatched) {
		const meta = projectToMeta({ ...state, funnel });
		const soParcela = funnel.qualifyAnswers.hasLance === "so_parcela";

		// FIX-360 — `scarcity` SEMPRE antes do card de decisão (nunca depois),
		// exceto no ramo `so_parcela` (a "agulha" toda é pulada ali, mesma
		// ordem do `dispatchDecisionCascade` Vercel). `buildScarcityCard`
		// devolve `null` sem `groupId` ancorado — nunca fabrica.
		if (!soParcela) {
			const scarcity = buildScarcityCard(meta);
			if (scarcity) {
				events.push({ type: "text-boundary" });
				events.push({
					type: "artifact",
					artifactType: "scarcity",
					payload: scarcity.payload,
					toolCallId: crypto.randomUUID(),
				});
			}
		}

		events.push({ type: "text-boundary" });
		events.push({
			type: "artifact",
			artifactType: soParcela ? "two_paths" : "decision_prompt",
			payload: soParcela ? buildTwoPathsCard(meta).payload : buildDecisionPromptCard(meta).payload,
			toolCallId: crypto.randomUUID(),
		});
		funnel = { ...funnel, decisionDispatched: true };
	}

	return { funnel, events };
}
