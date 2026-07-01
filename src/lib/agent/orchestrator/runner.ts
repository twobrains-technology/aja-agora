import type { ToolChoice } from "ai";
import { db } from "@/db";
import { artifacts as artifactsTable } from "@/db/schema";
import { resolveAgent } from "@/lib/agent/agents";
import { selectExamplesForTurn } from "@/lib/agent/example-selector";
import { allowedTools, phaseFromMeta } from "@/lib/agent/orchestrator/tool-policy";
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
import { evaluateArtifactGuards } from "./artifact-guard";
import { collapseSelfDuplicatedText } from "./collapse-self-duplicate";
import { enrichContractFormPayload } from "./contract-form-prefill";
import { coerceDialPayload, offerSnapshotFromArtifact } from "./dial-payload";
import { extractDiscoveryCount } from "./discovery-count";
import { detectLeadFormArtifact, initializeLeadCollection } from "./lead-collection";
import { coerceSimulationPayload } from "./simulation-payload";
import type { Channel, ChatMessage, ProducedArtifact, TurnEvent } from "./types";

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
	/**
	 * FIX-77: blocos de system dinâmicos por turno (knownName/experience/doubts)
	 * montados pelo orchestrator (buildSystemContext). ANTES iam prependados em
	 * `messages`; agora vão pro builder junto do examplesBlock (instructions, sem
	 * cacheControl) — sem warning de prompt-injection e sem duplicar a memória.
	 */
	systemContextBlocks?: string[];
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
		systemContextBlocks = [],
	} = args;

	let fullResponse = "";
	const artifacts: ProducedArtifact[] = [];
	// FIX-7: tamanho da descoberta DESTE turno (tool-results de search/recommend).
	// Com opção única, o recommendation_card é suprimido — o detalhamento
	// (simulation_result) é o card único, sem duplicar o mesmo grupo na tela.
	let discoveryCount: number | null = null;
	// FIX-C3: retorno REAL do simulate_quota deste turno — fonte única dos
	// números do simulation_result (o modelo digitava o payload na mão e
	// alucinou receivedCredit = carta cheia na jornada BB de 2026-06-11).
	let lastQuotaSimulation: unknown = null;
	const executedToolNames: string[] = [];
	let handoffSignal: { triggerId?: string; reason: string } | null = null;
	const stagesEmitted = new Set<string>();

	const isConcierge = !meta.currentCategory;
	// FIX-19: policy de tools da fase atual — espelho do filtro aplicado no
	// builder (resolveAgent repassa o meta). Usada SÓ pro tripwire
	// [tool-policy-violation]; a 1ª linha de defesa é o toolset filtrado.
	const toolPolicyAllowed = new Set(allowedTools(meta, channel));

	// Examples filtrados por contexto do turno. Vão num system block separado
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

	// FIX-77: systemContext (knownName/experience/doubts) + examplesBlock vão pro
	// builder via `instructions` (campo `system` da SDK), NÃO prependados em
	// `messages` — system dentro de `messages` dispara o warning de prompt-injection
	// da AI SDK 6 a cada turno e duplicava a memória Letta. Ordem: systemContext
	// antes do examplesBlock (examples mais perto da fala do usuário, recency bias).
	const extraSystemBlocks = [...systemContextBlocks, examplesBlock].filter(
		(b): b is string => Boolean(b),
	);

	// BUG-CONVERSATION-ID-HALLUCINATION: conversationId/channel são passados ao
	// resolveAgent → buildAgent → buildConsorcioTools({ conversationId }) injeta
	// via closure nas tools sensíveis (save_contact_name etc.). Sem isso, modelo
	// alucinava "conv_001" e UPDATE no Postgres falhava silenciosamente.
	const agent = await resolveAgent(currentPersona, meta, {
		memoryContext,
		conversationId,
		channel,
		toolChoice: forceToolChoice,
		extraSystemBlocks,
	});

	const result = await agent.stream({ messages });

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
				// FIX-C3: guarda o retorno real do simulate_quota pra coagir o
				// payload do simulation_result emitido neste mesmo turno.
				if (part.toolName === "simulate_quota") {
					lastQuotaSimulation = (part as { output?: unknown }).output ?? null;
				}
				break;
			}
			case "tool-call": {
				const toolName = part.toolName;
				const input = part.input as Record<string, unknown>;
				const toolCallId = part.toolCallId;
				executedToolNames.push(toolName);
				// FIX-19: com o gating a montante (builder filtra o toolset pela
				// tool-policy da fase), uma chamada de tool FORA da policy significa
				// que a tool entrou no request indevidamente — bug da policy/builder,
				// não do modelo. Os guards abaixo seguram o estrago (segunda linha),
				// mas o log forte é o tripwire pra corrigir a tabela.
				if (!isConcierge && !toolPolicyAllowed.has(toolName)) {
					console.error(
						`[tool-policy-violation] tool=${toolName} fase=${phaseFromMeta(meta)} chamada fora da policy — toolset não foi filtrado a montante (conv=${conversationId})`,
					);
				}
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
					// FIX-20: segunda linha de defesa em tabela declarativa — as regras
					// (whatsapp-optin/post-closure/premature-contract/reveal-loop/
					// single-option), a ordem e os formatos de log vivem em
					// artifact-guard.ts, com 1 teste por regra + teste de ordem.
					const guardVerdict = evaluateArtifactGuards({
						meta,
						artifactType,
						userIntent,
						isUserTurn,
						discoveryCount,
						conversationId,
						turnArtifactTypes: artifacts.map((a) => a.type),
					});
					if (!guardVerdict.allow) {
						console.log(guardVerdict.logLine);
						// FIX-24: além do console.log (que cassettes grepam), emite o
						// evento de telemetria pro turn-trace popular `suppressed[]`.
						yield { type: "suppression", artifactType, reason: guardVerdict.rule };
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
						// FIX-27: opt-in com número JÁ capturado (lead form/identify) →
						// confirmação de 1 clique. knownPhone mascarado vem do meta (LGPD).
						// Sem contactPhone, o card cai no modo coleta normal.
						if (artifactType === "whatsapp_optin" && meta.contactPhone) {
							payload = {
								...(typeof input === "object" && input !== null ? input : {}),
								knownPhone: meta.contactPhone,
							};
						}
						// FIX-C3: números do card de simulação SEMPRE do retorno real do
						// simulate_quota — o modelo alucinava campos (receivedCredit =
						// carta cheia com embutido de 49%).
						if (artifactType === "simulation_result") {
							payload = coerceSimulationPayload(input, lastQuotaSimulation);
						}
						if (artifactType === "contemplation_dial") {
							const turnAnchor =
								artifacts.find((a) => a.type === "simulation_result") ??
								artifacts.find((a) => a.type === "recommendation_card") ??
								artifacts.find((a) => a.type === "group_card");
							const snapshot =
								offerSnapshotFromArtifact(turnAnchor?.payload) ?? meta.recommendedOffer;
							// FIX-C5: defaults do perfil declarado na qualificação.
							payload = coerceDialPayload(input, snapshot, {
								prazoMeses: meta.qualifyAnswers?.prazoMeses,
								lanceValue: meta.qualifyAnswers?.lanceValue,
							});
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

	// FIX-102: degeneração NÃO-determinística da LLM às vezes cola a resposta
	// inteira consigo mesma ("Boa, então já sabe como funciona!Boa, então já
	// sabe como funciona!", zero separador). Colapsa ANTES de qualquer uso
	// posterior (persistência, prefixForNextGate) — guarda determinística
	// decidida no card fix-102-assistant-texto-duplicado-eco.md.
	fullResponse = collapseSelfDuplicatedText(fullResponse);

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

	let cacheUsage: { cacheRead: number; cacheWrite: number } | null = null;
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
			cacheUsage = { cacheRead: read, cacheWrite: written };
		}
	} catch {}
	// FIX-24: além do console.log (cassettes grepam), emite o evento de telemetria
	// pro turn-trace popular `cacheRead`/`cacheWrite`. Fora do try pra não engolir
	// um throw do consumidor no ponto do yield.
	if (cacheUsage) {
		yield { type: "usage", ...cacheUsage };
	}

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
		// BUG-SNAPSHOT-ANCHOR-POBRE (E2E real 2026-06-11): o snapshot precisa do
		// artifact RICO — só o simulation_result carrega lanceScenario/embeddedBid
		// (lance real + mês de referência + teto de embutido, FIX-C2). Usar o
		// recommendation_card aqui deixava o dial sem calibração (31% vs 24%).
		const snapshotAnchor =
			artifacts.find((a) => a.type === "simulation_result") ??
			artifacts.find((a) => a.type === "recommendation_card") ??
			artifacts.find((a) => a.type === "group_card");
		const offerSnapshot = offerSnapshotFromArtifact(snapshotAnchor?.payload);
		await persistMeta(conversationId, {
			...refreshed,
			revealCompleted: true,
			// Também marca searchDispatched: se o agent free-rodou search_groups (sem
			// passar pelo dispatch do orquestrador), isso impede o index.ts de
			// re-disparar OUTRO reveal — trata o que já apareceu como "a busca".
			searchDispatched: true,
			recommendedAdministradora: administradora,
			// FIX-68: snapshot do valor-alvo desta descoberta — baseline pra detectar
			// uma TROCA de faixa no próximo turno (tool-policy.revealValueTargetChanged).
			...(typeof refreshed.qualifyAnswers?.creditMax === "number"
				? { discoveredCreditTarget: refreshed.qualifyAnswers.creditMax }
				: {}),
			...(offerSnapshot ? { recommendedOffer: offerSnapshot } : {}),
		});
	}

	// FIX-68: re-descoberta pós-reveal (o usuário trocou de faixa e a nova busca
	// produziu cards) — re-snapshota o valor-alvo pra FECHAR o ciclo: a partir daí
	// um afirmativo curto sobre a faixa NOVA ("ta otimo" no 130k) tem
	// creditMax == discoveredCreditTarget → tool-policy/artifact-guard voltam a
	// segurar a busca (anti BUG-REVEAL-LOOP), em vez de reabrir pra sempre.
	if (meta.revealCompleted === true && artifacts.some((a) => REVEAL_ARTIFACTS.has(a.type))) {
		const refreshed = await reloadMeta(conversationId);
		const target = refreshed.qualifyAnswers?.creditMax;
		if (typeof target === "number" && target !== refreshed.discoveredCreditTarget) {
			await persistMeta(conversationId, { ...refreshed, discoveredCreditTarget: target });
		}
	}

	// FIX-6 (what-if): re-simulação legítima atualiza o snapshot da oferta —
	// o dial sempre acompanha o ÚLTIMO detalhamento que o usuário viu.
	// BUG-ADMIN-DESSINCRONIZADA (2026-06-12): a administradora anda JUNTO com o
	// snapshot — senão a directive do fechamento e a proposta real
	// (contract-input.ts: administradoraPreferida) ficam presas na âncora do
	// reveal antigo ("vai direto pra Âncora!" com simulação decidida na Itaú).
	if (meta.revealCompleted) {
		const newSim = artifacts.find((a) => a.type === "simulation_result");
		const snap = offerSnapshotFromArtifact(newSim?.payload);
		if (snap) {
			const refreshed = await reloadMeta(conversationId);
			await persistMeta(conversationId, {
				...refreshed,
				recommendedOffer: snap,
				recommendedAdministradora:
					snap.administradora ?? refreshed.recommendedAdministradora,
			});
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
			// FIX-17: o gate "name" também NÃO leva prefix — gateInteractive('name') é
			// null no WhatsApp; com prefix, o adapter limparia o textBuffer e a
			// pergunta do nome (texto do agente) se perderia no canal.
			if (fullResponse && gate !== "search" && gate !== "name" && !producedArtifact) {
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
