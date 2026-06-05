import type { ToolChoice } from "ai";
import { db } from "@/db";
import { artifacts as artifactsTable } from "@/db/schema";
import { resolveAgent } from "@/lib/agent/agents";
import { selectExamplesForTurn } from "@/lib/agent/example-selector";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { getPersona } from "@/lib/agent/personas-repo";
import { decideShowGate, type Gate, nextGate, type UserIntent } from "@/lib/agent/qualify-state";
import { renderPersonaExamplesBlock } from "@/lib/agent/system-prompt";
import { PRESENTATION_TOOLS } from "@/lib/agent/tools/ai-sdk";
import type { ArtifactType } from "@/lib/chat/types";
import { loadIdentity } from "@/lib/conversation/identity";
import { saveMessage } from "@/lib/conversation/messages";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import type { MemoryContext } from "@/lib/memory/types";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { enrichContractFormPayload } from "./contract-form-prefill";
import { coerceDialPayload, offerSnapshotFromArtifact } from "./dial-payload";
import { extractDiscoveryCount } from "./discovery-count";
import { detectLeadFormArtifact, initializeLeadCollection } from "./lead-collection";
import type { Channel, ChatMessage, ProducedArtifact, TurnEvent } from "./types";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

export type RunAgentResult = {
	fullResponse: string;
	artifacts: ProducedArtifact[];
	handoffSignaled: boolean;
	isConcierge: boolean;
	nextGateToFire: Gate | null;
	prefixForNextGate: string | null;
};

const LEAD_STAGE_BY_TOOL: Record<string, "engajado" | "qualificado"> = {
	simulate_quota: "engajado",
	recommend_groups: "qualificado",
};

/** Cards que constituem o reveal do passo 3+4 (âncora de revealCompleted). */
const REVEAL_ARTIFACTS = new Set([
	"comparison_table",
	"group_card",
	"recommendation_card",
	"simulation_result",
]);

/** BUG-SIMULATOR-OFFER-ENGOLIDO (2026-06-04): o guard anti-atropelo
 * (`!producedArtifact`) bloqueava o gate simulator-offer pra SEMPRE — o turno
 * do reveal produz cards e os turnos seguintes também (optin/decision), então
 * a oferta do simulador (docx passo 4: "na sequência" do reveal) nunca saía.
 * Exceção cirúrgica: o simulator-offer É elegível no MESMO turno que
 * apresentou os cards do reveal. Os demais gates seguem bloqueados. */
export function allowGateWithArtifacts(gate: Gate, artifactTypes: string[]): boolean {
	return gate === "simulator-offer" && artifactTypes.some((t) => REVEAL_ARTIFACTS.has(t));
}

function artifactTypeFor(toolName: string): ArtifactType {
	const short = toolName.replace("present_", "");
	return short as ArtifactType;
}

export async function* runAgentTurn(args: {
	conversationId: string;
	channel: Channel;
	currentPersona: Persona;
	meta: ConversationMetadata;
	messages: ChatMessage[];
	isUserTurn: boolean;
	userIntent?: UserIntent;
	memoryContext?: MemoryContext | null;
	/**
	 * Quando passado, força o modelo a chamar essa tool neste turn (via
	 * AI SDK 6 `toolChoice`). Calculado pelo orchestrator em `index.ts`
	 * via `isLikelyNameResponse()` — fix BUG-SHORT-GREETING-AFTER-NAME
	 * Nível 1. Bypassa o cache de agents.
	 */
	// biome-ignore lint/suspicious/noExplicitAny: ToolChoice<T> é genérico sobre o ToolSet do agent — repassamos como-está pro resolveAgent.
	forceToolChoice?: ToolChoice<any>;
}): AsyncGenerator<TurnEvent, RunAgentResult> {
	const {
		conversationId,
		channel,
		currentPersona,
		meta,
		messages,
		isUserTurn,
		userIntent = "neutral",
		memoryContext = null,
		forceToolChoice,
	} = args;

	let fullResponse = "";
	const artifacts: ProducedArtifact[] = [];
	// FIX-7: tamanho da descoberta DESTE turno (tool-results de search/recommend).
	// Com opção única, o recommendation_card é suprimido — o detalhamento
	// (simulation_result) é o card único, sem duplicar o mesmo grupo na tela.
	let discoveryCount: number | null = null;
	const executedToolNames: string[] = [];
	let handoffSignal: { triggerId?: string; reason: string } | null = null;
	const stagesEmitted = new Set<string>();

	const isConcierge = !meta.currentCategory;
	// BUG-REVEAL-LOOP (2026-06-02): depois que o reveal JÁ aconteceu (revealCompleted),
	// num turno de usuario o agent re-emitia os cards de DESCOBERTA (comparison/
	// recommendation/group) a cada afirmativo ("ta otimo", "bora") — loop nos cards
	// mockados que nunca cruzava pro passo 5. O guard abaixo suprime essas re-emissoes.
	// Chave em revealCompleted (não searchDispatched): a flag liga sempre que QUALQUER
	// reveal aparece — inclusive quando o próprio agent chama search_groups por conta
	// (free-run), caso em que searchDispatched ficava false e o guard não ativava
	// (visto no run real: comparison_table 5×). O reveal original é o 1º (revealCompleted
	// ainda false) → passa. simulation_result só é suprimido fora de what-if.
	const revealLoopActive = meta.revealCompleted === true && isUserTurn;
	// BUG-CONVERSATION-ID-HALLUCINATION: conversationId/channel são passados ao
	// resolveAgent → buildAgent → buildConsorcioTools({ conversationId }) injeta
	// via closure nas tools sensíveis (save_contact_name etc.). Sem isso, modelo
	// alucinava "conv_001" e UPDATE no Postgres falhava silenciosamente.
	const agent = await resolveAgent(currentPersona, meta, {
		memoryContext,
		conversationId,
		channel,
		toolChoice: forceToolChoice,
	});

	// Examples filtrados por contexto do turno. Vão num system message separado
	// pra preservar o cache da Anthropic no system prompt estático (ver
	// example-selector.ts pra ranking e renderPersonaExamplesBlock pra formato).
	const row = await getPersona(currentPersona);
	const selected = selectExamplesForTurn(row.examples, {
		expertise: meta.expertiseLevel,
		category: meta.currentCategory,
		channel,
		intent: userIntent,
	});
	const examplesBlock = renderPersonaExamplesBlock(selected);
	const messagesWithExamples = examplesBlock
		? [{ role: "system" as const, content: examplesBlock }, ...messages]
		: messages;

	const result = await agent.stream({ messages: messagesWithExamples });

	for await (const part of result.fullStream) {
		switch (part.type) {
			case "text-delta":
				fullResponse += part.text;
				yield { type: "text-delta", text: part.text };
				break;
			case "tool-result": {
				// FIX-7: conta as opções retornadas pela descoberta (single-option
				// guard). Tools fora da descoberta retornam null e não interferem.
				const count = extractDiscoveryCount(part.toolName, (part as { output?: unknown }).output);
				if (count !== null) discoveryCount = count;
				break;
			}
			case "tool-call": {
				const toolName = part.toolName;
				const input = part.input as Record<string, unknown>;
				const toolCallId = part.toolCallId;
				executedToolNames.push(toolName);
				yield { type: "tool-call", toolName, input, toolCallId };

				if (toolName === "suggest_handoff") {
					const handoffInput = input as { triggerId?: string; reason?: string };
					handoffSignal = {
						triggerId: handoffInput.triggerId,
						reason: handoffInput.reason ?? "trigger satisfied",
					};
					break;
				}

				if (PRESENTATION_TOOLS.has(toolName)) {
					const artifactType = artifactTypeFor(toolName);
					// PF-07: guard de duplicação do whatsapp_optin — modelo pode
					// chamar 2x em conversation longa apesar do prompt. Suprimir
					// silenciosamente se já foi mostrado.
					const isWhatsappOptin = toolName === "present_whatsapp_optin";
					// BUG-REVEAL-LOOP: suprime re-emissão dos cards de descoberta
					// pós-reveal. simulation_result só é suprimido fora de what-if
					// (providing_info = usuário pediu novo valor → re-simular é legítimo).
					const isRereveal =
						revealLoopActive &&
						(artifactType === "comparison_table" ||
							artifactType === "recommendation_card" ||
							artifactType === "group_card" ||
							(artifactType === "simulation_result" && userIntent !== "providing_info"));
					// BUG-REVEAL-LOOP (hardening, QA crítico 2026-06-02): na web o
					// modelo emite present_decision_prompt por conta (free-run), então
					// decisionDispatched é o guard de idempotência também aqui — se o
					// card de decisão já apareceu, suprime re-emissão num turno de usuário.
					const isDecisionDup =
						meta.decisionDispatched === true && isUserTurn && artifactType === "decision_prompt";
					// BUG-POS-FECHAMENTO-NAO-TERMINAL (E2E real 2026-06-04): pós-Parabéns
					// (contractClosed) um afirmativo fazia o agente re-apresentar o
					// contract_form e "contratar" outra administradora. Estado terminal.
					const isContractDup = meta.contractClosed === true && artifactType === "contract_form";
					// FIX-11 (rodada 2026-06-05 tarde): o guard acima cobria SÓ o
					// contract_form — pós-fechamento, "qual status da proposta?" fazia o
					// agente re-rodar a descoberta e emitir recommendation_card +
					// simulation_result de OUTRA administradora (BANCO DO BRASIL pra quem
					// JÁ contratou CANOPUS). Estado terminal vale pra TODA a família de
					// artifacts de descoberta/simulação/decisão, em qualquer intent.
					const isPostClosure =
						meta.contractClosed === true &&
						(artifactType === "recommendation_card" ||
							artifactType === "simulation_result" ||
							artifactType === "comparison_table" ||
							artifactType === "group_card" ||
							artifactType === "contemplation_dial" ||
							artifactType === "decision_prompt");
					// FIX-7 (single-option guard): descoberta retornou opção ÚNICA →
					// recommendation_card duplicaria o grupo do detalhamento. Suprime;
					// o simulation_result vira o card único do reveal.
					const isSingleOptionDup = artifactType === "recommendation_card" && discoveryCount === 1;
					// FIX-12 (rodada 2026-06-05 tarde): no momento do gate identify o
					// modelo chamou present_contract_form (passo 5) — narrativa de
					// identidade quase idêntica, ambos os cards coletam CPF+celular+LGPD.
					// Submit criou proposta REAL na Bevi (CPF + bureau) sem o usuário ter
					// visto UMA opção. A descrição da tool era instrução, não defesa:
					// contract_form SÓ passa com reveal feito (revealCompleted) — antes
					// disso, identidade é assunto do gate identify do SERVIDOR. Com o
					// artifact suprimido o turno fica sem artifact e a avaliação de gates
					// abaixo reconduz ao identify naturalmente.
					const isPrematureContract =
						artifactType === "contract_form" && meta.revealCompleted !== true;
					if (isWhatsappOptin && !shouldEmitWhatsappOptin(meta)) {
						console.log(
							`[whatsapp-optin] guard: suprimindo artifact (pré-reveal ou duplicado) (conv=${conversationId})`,
						);
					} else if (isPostClosure) {
						console.log(
							`[post-closure] guard: suprimindo ${artifactType} pós-fechamento — estado terminal (conv=${conversationId}, intent=${userIntent})`,
						);
					} else if (isPrematureContract) {
						console.log(
							`[contract-gate] guard: suprimindo contract_form PRÉ-reveal — identidade é assunto do gate identify (conv=${conversationId}, intent=${userIntent})`,
						);
					} else if (isRereveal || isDecisionDup || isContractDup) {
						console.log(
							`[reveal-loop] guard: suprimindo ${artifactType} re-emitido pós-reveal (conv=${conversationId}, intent=${userIntent})`,
						);
					} else if (isSingleOptionDup) {
						console.log(
							`[single-option] guard: suprimindo recommendation_card — descoberta retornou opção única (conv=${conversationId})`,
						);
					} else {
						// FIX-6: o dial NUNCA mostra números divergentes da oferta
						// ativa — coage payload com o snapshot do reveal (ou com o
						// âncora emitido neste mesmo turno, se houver).
						let payload = input;
						// FIX-9: identidade já coletada no identify → form de contratação
						// vira confirmação (CPF mascarado, nunca em claro no payload).
						if (artifactType === "contract_form") {
							try {
								const identity = await loadIdentity(conversationId);
								payload = enrichContractFormPayload(input, identity);
							} catch {
								// falha de decrypt/DB não pode derrubar o turno — form vazio.
							}
						}
						if (artifactType === "contemplation_dial") {
							const turnAnchor =
								artifacts.find((a) => a.type === "simulation_result") ??
								artifacts.find((a) => a.type === "recommendation_card") ??
								artifacts.find((a) => a.type === "group_card");
							const snapshot =
								offerSnapshotFromArtifact(turnAnchor?.payload) ?? meta.recommendedOffer;
							payload = coerceDialPayload(input, snapshot);
						}
						artifacts.push({
							type: artifactType,
							payload,
						});
						yield { type: "artifact", artifactType, payload, toolCallId };
					}
				}

				const stage = LEAD_STAGE_BY_TOOL[toolName];
				if (stage && !stagesEmitted.has(stage)) {
					stagesEmitted.add(stage);
					yield { type: "lead-stage", stage };
				}
				break;
			}
		}
	}

	try {
		const finishReason = await result.finishReason;
		if (finishReason !== "stop" && finishReason !== "tool-calls") {
			console.warn(
				`[orchestrator] Agent stream ended with unexpected finishReason="${finishReason}" persona=${currentPersona}`,
			);
		}
	} catch {}

	if (handoffSignal && !isConcierge) {
		console.log(
			`[handoff] persona=${currentPersona} reason="${handoffSignal.reason}" — pausing flow`,
		);
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			handoffSuggested: true,
			handoffReason: handoffSignal.reason,
		});
		yield {
			type: "handoff",
			reason: handoffSignal.reason,
			triggerId: handoffSignal.triggerId,
		};
		return {
			fullResponse: "",
			artifacts: [],
			handoffSignaled: true,
			isConcierge,
			nextGateToFire: null,
			prefixForNextGate: null,
		};
	}

	try {
		const pmeta = await result.providerMetadata;
		const anthropicMeta = pmeta?.anthropic as
			| { cacheCreationInputTokens?: number; cacheReadInputTokens?: number }
			| undefined;
		if (anthropicMeta) {
			const written = anthropicMeta.cacheCreationInputTokens ?? 0;
			const read = anthropicMeta.cacheReadInputTokens ?? 0;
			if (written > 0 || read > 0) {
				console.log(`[cache] write=${written} read=${read} (persona=${currentPersona})`);
			}
		}
	} catch {}

	const groupCards = artifacts.filter((a) => a.type === "group_card");
	if (groupCards.length >= 2) {
		const nonGroupCards = artifacts.filter((a) => a.type !== "group_card");
		const consolidated: ProducedArtifact = {
			type: "comparison_table",
			payload: { groups: groupCards.map((a) => a.payload) },
		};
		artifacts.length = 0;
		artifacts.push(...nonGroupCards, consolidated);
		console.log(
			`[orchestrator] Guard: consolidated ${groupCards.length} group_cards into comparison_table`,
		);
	}

	// Persistir mesmo se turn for só-tools — admin precisa ver que o agent respondeu.
	// Sem isso, turns como save_contact_name / present_value_picker viram ghost no histórico
	// (bug BUG-ADMIN-MESSAGE-MISSING).
	if (fullResponse || executedToolNames.length > 0) {
		const content = fullResponse || `[tool: ${executedToolNames.join(", ")}]`;
		const messageId = await saveMessage(
			conversationId,
			"assistant",
			content,
			channel,
			currentPersona,
		);

		// BUG-LEAD-HISTORY-INCOMPLETE: artifacts emitidos pelo agente
		// (group_card, simulation_result, lead_form, etc.) precisam ficar
		// vinculados à message do turno. Sem isso o histórico do lead no
		// admin perde todos os cards/comparativos. Vale pros 3 canais
		// (web, whatsapp, simulador) porque todos passam por aqui.
		if (artifacts.length > 0) {
			await db.insert(artifactsTable).values(
				artifacts.map((a) => ({
					messageId,
					type: a.type,
					payload: a.payload as Record<string, unknown>,
					createdAt: simulatorNow(),
				})),
			);
		}
	}

	if (detectLeadFormArtifact(artifacts) && !meta.leadCollection) {
		const refreshed = await reloadMeta(conversationId);
		// Pula stages cujos dados já foram capturados conversacionalmente
		// via save_contact_name / save_contact_whatsapp (Fase 6).
		const initial = await initializeLeadCollection(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			leadCollection: initial,
		});
	}

	// PF-07: marca whatsappOptinShown=true após emitir o artifact pela 1a vez.
	// Próxima chamada da tool no mesmo conversation cai no guard acima.
	if (artifacts.some((a) => a.type === "whatsapp_optin") && !meta.whatsappOptinShown) {
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...refreshed,
			whatsappOptinShown: true,
		});
	}

	// BUG-REVEAL-LOOP: marca revealCompleted quando o passo 3+4 (opções + plano)
	// foi apresentado. Habilita o gate "decision" (nextGate) no próximo turno de
	// avanço do usuário → present_decision_prompt → passo 5. QUALQUER card de
	// reveal serve de âncora — o reveal pode sair como comparison_table (2+),
	// group_card (1), recommendation_card (destacado) ou simulation_result. Limitar
	// a recommendation/simulation deixava a flag desligada quando o agent abria o
	// reveal com group_card/comparison (visto no run real 2026-06-02).
	if (artifacts.some((a) => REVEAL_ARTIFACTS.has(a.type)) && !meta.revealCompleted) {
		const refreshed = await reloadMeta(conversationId);
		// Captura a administradora do plano destacado pro contexto do card de
		// decisão / passo 5. Prioridade: recommendation > simulation > group_card.
		const anchor =
			artifacts.find((a) => a.type === "recommendation_card") ??
			artifacts.find((a) => a.type === "simulation_result") ??
			artifacts.find((a) => a.type === "group_card");
		const administradora =
			typeof anchor?.payload?.administradora === "string"
				? anchor.payload.administradora
				: refreshed.recommendedAdministradora;
		// FIX-6: snapshot dos números da oferta âncora — fonte única do dial.
		const offerSnapshot = offerSnapshotFromArtifact(anchor?.payload);
		await persistMeta(conversationId, {
			...refreshed,
			revealCompleted: true,
			// Também marca searchDispatched: se o agent free-rodou search_groups (sem
			// passar pelo dispatch do orquestrador), isso impede o index.ts de
			// re-disparar OUTRO reveal — trata o que já apareceu como "a busca".
			searchDispatched: true,
			recommendedAdministradora: administradora,
			...(offerSnapshot ? { recommendedOffer: offerSnapshot } : {}),
		});
	}

	// FIX-6 (what-if): re-simulação legítima atualiza o snapshot da oferta —
	// o dial sempre acompanha o ÚLTIMO detalhamento que o usuário viu.
	if (meta.revealCompleted) {
		const newSim = artifacts.find((a) => a.type === "simulation_result");
		const snap = offerSnapshotFromArtifact(newSim?.payload);
		if (snap) {
			const refreshed = await reloadMeta(conversationId);
			await persistMeta(conversationId, { ...refreshed, recommendedOffer: snap });
		}
	}

	// BUG-REVEAL-LOOP (hardening): marca decisionDispatched quando o card de decisão
	// aparece — inclusive quando o MODELO o emite por conta (free-run web), não só
	// quando o orquestrador o dirige (index.ts). Sem isso o guard de idempotência do
	// decision_prompt nunca era exercitado na web (achado do QA crítico 2026-06-02).
	if (artifacts.some((a) => a.type === "decision_prompt") && !meta.decisionDispatched) {
		const refreshed = await reloadMeta(conversationId);
		await persistMeta(conversationId, { ...refreshed, decisionDispatched: true });
	}

	const producedArtifact = artifacts.length > 0;
	const turnArtifactTypes = artifacts.map((a) => a.type);
	let nextGateToFire: Gate | null = null;
	let prefixForNextGate: string | null = null;
	// Guard anti-atropelo: turno com artifact não emite gate — EXCETO o
	// simulator-offer no turno do reveal (allowGateWithArtifacts; docx passo 4).
	const mayEvaluateGates =
		!producedArtifact || turnArtifactTypes.some((t) => REVEAL_ARTIFACTS.has(t));
	if (!isConcierge && mayEvaluateGates) {
		if (isUserTurn && !producedArtifact) {
			const userReplied = fullResponse.length > 0;
			if (meta.experiencePrev === "doubts" && !meta.doubtsAddressed && userReplied) {
				meta.doubtsAddressed = true;
				await persistMeta(conversationId, meta);
			}
			if (meta.pendingFollowUp && userReplied) {
				meta.pendingFollowUp = false;
				await persistMeta(conversationId, meta);
			}
		}

		const refreshed = await reloadMeta(conversationId);
		// PF-08: lê contactName atual pra pausar gates enquanto nome não capturado.
		const { db } = await import("@/db");
		const { conversations } = await import("@/db/schema");
		const { eq } = await import("drizzle-orm");
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
			columns: { contactName: true },
		});
		const gate = nextGate(refreshed, { hasContactName: Boolean(conv?.contactName) });
		const shouldShow = decideShowGate({
			gate,
			intent: userIntent,
			meta: refreshed,
			isUserTurn,
		});
		const passesArtifactGuard =
			!producedArtifact || allowGateWithArtifacts(gate, turnArtifactTypes);
		if (shouldShow && passesArtifactGuard) {
			nextGateToFire = gate;
			// Com artifacts no turno, o texto já foi escrito no stream — sem prefixo.
			if (fullResponse && gate !== "search" && !producedArtifact) {
				prefixForNextGate = fullResponse;
			}
		} else if (gate !== "doubts-wait" && isUserTurn && !producedArtifact) {
			console.log(`[gate-skip] gate=${gate} intent=${userIntent} — staying conversational`);
		}
	}

	return {
		fullResponse,
		artifacts,
		handoffSignaled: false,
		isConcierge,
		nextGateToFire,
		prefixForNextGate,
	};
}
