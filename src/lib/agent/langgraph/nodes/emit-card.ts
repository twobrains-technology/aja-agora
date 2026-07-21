// Nó `emitCard` — traduz a decisão de rota (`state.gate`, calculada pelo nó
// `route`) em `TurnEvent`s determinísticos: o evento `gate` (pro input
// estruturado do gate ativo) + os cards server-side da coreografia
// (FIX-360/361) — sempre via builder determinístico (`server-cards.ts`),
// NUNCA dependente de tool-call do LLM (crítico "tool sumida",
// FIX-246/253/280/309). FIX-361: toda emissão passa por
// `evaluateArtifactGuards` (`guarded-artifact.ts`) — 2ª linha de defesa
// contra pós-fechamento/re-reveal/duplicação intra-turno.
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
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { AgentGraphStateType } from "../state";
import { artifactAllowed, type GuardContext } from "./guarded-artifact";

export function emitCardNode(
	state: AgentGraphStateType,
	config?: LangGraphRunnableConfig,
): Partial<AgentGraphStateType> {
	const events: TurnEvent[] = [];
	let funnel = state.funnel;

	// Artifacts já emitidos ANTES neste turno (nó `discovery`) — alimenta a
	// regra `card-dup-intraturn` (nunca o mesmo tipo 2x no mesmo turno).
	const turnArtifactTypes = state.events
		.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
		.map((ev) => ev.artifactType);
	const guardCtx: GuardContext = {
		meta: projectToMeta(state),
		userIntent: state.intent ?? "neutral",
		isUserTurn: state.isUserTurn,
		channel: state.channel,
		discoveryCount: null,
		conversationId: state.conversationId,
		turnArtifactTypes,
	};

	// Emissão AO VIVO via `config.writer`. Antes estes eventos só viviam em
	// `state.events` e dependiam do drain do `values` final no `run-turn.ts` —
	// mas o grafo PAUSA no `human` (interrupt) e esse `values` final nunca chega
	// ao chamador. Resultado: o cliente recebia só `text-delta`/`tool-call` (que
	// já iam pelo writer) e NENHUM card jamais renderizava. O writer entrega na
	// ordem em que é chamado, então a ordem do turno é preservada.
	if (state.gate) {
		// `modelAsked`: o `converse` agora é CIENTE do gate (via `GATE_INTENT`) e
		// faz a pergunta com as palavras dele. Se produziu texto neste turno, o
		// adapter NÃO deve reinjetar a pergunta canônica (`gateQuestion`) — senão
		// vira DUAS perguntas (a do modelo + a do card). Se o modelo ficou mudo
		// (turno vazio), fica `false` → o card injeta a pergunta como rede (nunca
		// cala a pergunta). O `text-boundary`/persist a jusante mantêm a ordem.
		// `modelAsked` = o modelo FEZ UMA PERGUNTA (sinal real do sanitizer,
		// `hasHeldQuestion`), não "emitiu algum caractere". Com o proxy antigo, uma
		// fala social sem pergunta ("Prazer em te ajudar!") calava a pergunta
		// canônica do card — as duas redes caíam juntas e o turno terminava sem
		// ninguém perguntando nada.
		events.push({ type: "gate", gate: state.gate, modelAsked: state.modelAskedQuestion });
	}

	// A liberação do hero pendente MUDOU DE LUGAR: vive no `advance`, que roda
	// ANTES do `converse` — só assim o modelo sabe que vai recomendar e fala
	// disso, em vez de já perguntar o prazo com o card caindo embaixo.

	// FIX-360 — `topic_picker`: card ÚNICO pro usuário novato, assim que
	// `experience` resolve (experiencePrev==="first") — independente do gate
	// ativo NESTE turno. `topicPickerDispatched` garante emissão única; sem
	// janela adicional contra `recoConsentDispatched` (diferente do runtime
	// Vercel) porque neste grafo `experience`→`reco-consent` podem resolver
	// no MESMO turno (analyze funde `experiencePrev` antes de `route`
	// computar o próximo gate) — a janela do Vercel nunca seria alcançável
	// aqui.
	// Nunca no MESMO turno de um gate: o picker de tópicos é um convite lateral e
	// competia com a pergunta do funil ("Posso te mostrar a opção que recomendo?"
	// + "Escolha uma opção: Ver tópicos", os dois juntos). Sem gate no turno, ele
	// sai normal; com gate, espera — `topicPickerDispatched` só é marcado quando
	// de fato saiu.
	if (!state.gate && funnel.experiencePrev === "first" && !funnel.topicPickerDispatched) {
		if (artifactAllowed(guardCtx, "topic_picker")) {
			events.push({
				type: "artifact",
				artifactType: "topic_picker",
				payload: buildTopicPickerCard().payload,
				toolCallId: crypto.randomUUID(),
			});
			turnArtifactTypes.push("topic_picker");
		}
		funnel = { ...funnel, topicPickerDispatched: true };
	}

	// FIX-360 — `embedded_bid`: educação + opt-in do lance embutido, emitido
	// enquanto o gate segue sem resposta (o nó `advance` já consome a
	// resposta de texto livre ANTES deste nó rodar — sem loop, FIX-260).
	if (
		state.gate === "lance-embutido" &&
		funnel.qualifyAnswers.lanceEmbutido === undefined &&
		!funnel.qualifyAnswers.embeddedBidDispatched &&
		artifactAllowed(guardCtx, "embedded_bid")
	) {
		const meta = projectToMeta({ ...state, funnel });
		events.push({ type: "text-boundary" });
		events.push({
			type: "artifact",
			artifactType: "embedded_bid",
			payload: buildEmbeddedBidCard(meta).payload,
			toolCallId: crypto.randomUUID(),
		});
		turnArtifactTypes.push("embedded_bid");
		funnel = {
			...funnel,
			qualifyAnswers: { ...funnel.qualifyAnswers, embeddedBidDispatched: true },
		};
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
			if (scarcity && artifactAllowed(guardCtx, "scarcity")) {
				events.push({ type: "text-boundary" });
				events.push({
					type: "artifact",
					artifactType: "scarcity",
					payload: scarcity.payload,
					toolCallId: crypto.randomUUID(),
				});
				turnArtifactTypes.push("scarcity");
			}
		}

		const finalArtifactType = soParcela ? "two_paths" : "decision_prompt";
		if (artifactAllowed(guardCtx, finalArtifactType)) {
			events.push({ type: "text-boundary" });
			events.push({
				type: "artifact",
				artifactType: finalArtifactType,
				payload: soParcela
					? buildTwoPathsCard(meta).payload
					: buildDecisionPromptCard(meta).payload,
				toolCallId: crypto.randomUUID(),
			});
		}
		funnel = { ...funnel, decisionDispatched: true };
	}

	// NÃO emite aqui. Quem entrega "gate"/"artifact" ao cliente é o `persist`,
	// DEPOIS de `persistMeta` — os adapters releem a meta fresca do banco pra
	// montar o card (`reloadMeta`, web/adapter.ts:308). Emitir antes da escrita
	// fazia `gatePartData("credit", metaVelha)` cair no `if (!category) return
	// null` e NENHUM card aparecia na tela. Ordem é contrato, não detalhe.
	void config;
	return { funnel, events };
}
