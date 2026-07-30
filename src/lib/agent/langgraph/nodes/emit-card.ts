// Nó `emitCard` — traduz a decisão de rota (`state.gate`, calculada pelo nó
// `route`) em `TurnEvent`s determinísticos: o evento `gate` (pro input
// estruturado do gate ativo) + os cards server-side da coreografia
// (FIX-360/361) — sempre via builder determinístico (`server-cards.ts`),
// NUNCA dependente de tool-call do LLM (crítico "tool sumida",
// FIX-246/253/280/309). FIX-361: toda emissão passa por
// `evaluateArtifactGuards` (`guarded-artifact.ts`) — 2ª linha de defesa
// contra pós-fechamento/re-reveal/duplicação intra-turno.
//
// O `contract_form` (passo 5) TAMBÉM nasce aqui — ficou de fora da rodada 1 e
// isso abriu o buraco do fecho: o funil terminava mudo e quem dizia "bora
// fechar" ouvia "fico por aqui então". `real_offer`/`signature_handoff` e o
// resto da cerimônia seguem no handler de `offer-confirm` (route.ts), que roda
// depois do submit do formulário.
//
// NÃO empurra via `config.writer` (mesma nota de `discovery.ts`) — "gate"
// dispara `reloadMeta` fresco no adapter (web/adapter.ts:308); só é seguro
// entregar depois que `persist` gravar. `run-turn.ts` drena do estado final.

import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { enrichContractFormPayload } from "@/lib/agent/orchestrator/contract-form-prefill";
import {
	buildDecisionPromptCard,
	buildEmbeddedBidCard,
	buildScarcityCard,
	buildTopicPickerCard,
	buildTwoPathsCard,
} from "@/lib/agent/orchestrator/server-cards";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import type { Gate } from "@/lib/agent/qualify-state";
import { loadIdentity } from "@/lib/conversation/identity";
import { projectToMeta } from "../emit";
import type { AgentGraphStateType, FunnelState } from "../state";

/** FIX-372 (rodada 4): condição pura da rede de segurança de escassez — cliente
 * DECIDIDO (`intent === "ready_to_proceed"`) ancora `escolha` no nó `advance`
 * antes deste nó rodar, e `nextGate` (qualify-state.ts:421) pula o gate
 * `decision` pra sempre a partir daí (`!meta.escolha` nunca mais é true). Sem
 * esta rede, quem decide rápido (o perfil que MAIS se beneficia do empurrão de
 * urgência) nunca vê o card de escassez — só quem ainda está indeciso o vê,
 * exatamente o oposto do que a rubrica pedia. Extraída como função pura
 * (mesmo padrão do FIX-368) pra ser testável sem montar o grafo inteiro. */
export function shouldEmitLateScarcity(
	gate: Gate | undefined,
	funnel: Pick<FunnelState, "scarcityDispatched" | "qualifyAnswers">,
): boolean {
	return (
		gate === "contract" &&
		!funnel.scarcityDispatched &&
		funnel.qualifyAnswers.hasLance !== "so_parcela"
	);
}

import { artifactAllowed, type GuardContext } from "./guarded-artifact";

export async function emitCardNode(
	state: AgentGraphStateType,
	config?: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
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
	// CHIPS SÓ ONDE HÁ PERGUNTA.
	//
	// No turno do reveal o `converse` agora apenas APRESENTA (fala + cards) e não
	// faz a pergunta do gate — ela é do turno seguinte. Emitir os chips aqui os
	// deixaria pendurados embaixo dos cards sem nenhuma pergunta acima, que é
	// exatamente o "badge fora de ordem" visto ao vivo (Kairo, 2026-07-30). O gate
	// continua ATIVO no estado (`pendingGate` inclusive), então nada se perde: no
	// próximo turno ele pergunta e os chips saem colados na pergunta.
	if (state.gate && !state.apresentaOfertaNesteTurno) {
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
				funnel = { ...funnel, scarcityDispatched: true };
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

	// FIX-372 (rodada 4, achado ao vivo pelo orquestrador): cliente DECIDIDO
	// (`intent === "ready_to_proceed"`, ex. "bora fechar", clique em "Tenho
	// interesse") ancora `escolha` no nó `advance` ANTES deste nó rodar —
	// `nextGate` (qualify-state.ts:421) então PULA o gate `decision` pra sempre
	// (`!meta.escolha` nunca mais é true), e o bloco de escassez acima nunca
	// dispara. Resultado observado ao vivo: em 7 conversas reais de teste desta
	// campanha, 0 viram o card de escassez — não por falta de dado da Bevi (a
	// oferta ancorada tinha `availableSlots` real em todas), mas porque o
	// cliente decidido nunca passa pelo gate que o mostra. É exatamente o
	// perfil "com pressa" que mais se beneficiaria do empurrão de urgência.
	// Rede de segurança: se chegou até aqui (`gate === "contract"`, prestes a
	// mostrar o formulário) e a escassez ainda não foi mostrada nesta conversa,
	// mostra AGORA — reforço, não pergunta, então não atrasa o fechamento nem
	// pede confirmação de novo. Mesma regra de nunca fabricar: `buildScarcityCard`
	// retorna `null` sem `groupId`/`availableSlots` reais ancorados.
	if (shouldEmitLateScarcity(state.gate, funnel) && artifactAllowed(guardCtx, "scarcity")) {
		const meta = projectToMeta({ ...state, funnel });
		const scarcity = buildScarcityCard(meta);
		if (scarcity) {
			events.push({ type: "text-boundary" });
			events.push({
				type: "artifact",
				artifactType: "scarcity",
				payload: scarcity.payload,
				toolCallId: crypto.randomUUID(),
			});
			turnArtifactTypes.push("scarcity");
			funnel = { ...funnel, scarcityDispatched: true };
		}
	}

	// PASSO 5 — o formulário que cria a proposta REAL. Era o buraco do fecho: no
	// runtime LangGraph nenhum nó o emitia e a tool `present_contract_form` está
	// fora do toolset (de propósito — ordem de funil é código). Resultado ao
	// vivo: o cliente dizia "bora fechar", o agente respondia "só preciso de uns
	// dados rápidos" e NADA aparecia na tela. A identidade já foi coletada no
	// gate `identify`, então o card vem como CONFIRMAÇÃO (CPF mascarado — o
	// número completo nunca volta pro browser).
	if (
		state.gate === "contract" &&
		!funnel.contractFormDispatched &&
		artifactAllowed(guardCtx, "contract_form")
	) {
		const identity = await loadIdentity(state.conversationId).catch(() => null);
		events.push({ type: "text-boundary" });
		events.push({
			type: "artifact",
			artifactType: "contract_form",
			payload: enrichContractFormPayload(
				{
					conversationId: state.conversationId,
					// FIX-413 — o formulário lê a COTA DO CONTRATO, nunca a cota em
					// FOCO. `recommendedAdministradora` é escrita por resolução de
					// texto (é ela que faz a conversa acompanhar o cliente), e era
					// exatamente por ler esse campo aqui que dez revisões
					// independentes acharam a mesma classe de defeito: uma frase mal
					// interpretada amarrava o contrato na marca errada.
					//
					// Sem ação estruturada o formulário sai SEM administradora — o
					// cliente escolhe — em vez de sair amarrado no palpite do parser.
					// Ausente é melhor que errado, a mesma regra que o `avgBidValue`
					// já segue (FIX-375).
					...(funnel.contractOffer?.administradora
						? { administradora: funnel.contractOffer.administradora }
						: {}),
				},
				identity,
			),
			toolCallId: crypto.randomUUID(),
		});
		turnArtifactTypes.push("contract_form");
		funnel = { ...funnel, contractFormDispatched: true };
	}

	// NÃO emite aqui. Quem entrega "gate"/"artifact" ao cliente é o `persist`,
	// DEPOIS de `persistMeta` — os adapters releem a meta fresca do banco pra
	// montar o card (`reloadMeta`, web/adapter.ts:308). Emitir antes da escrita
	// fazia `gatePartData("credit", metaVelha)` cair no `if (!category) return
	// null` e NENHUM card aparecia na tela. Ordem é contrato, não detalhe.
	void config;
	return { funnel, events };
}
