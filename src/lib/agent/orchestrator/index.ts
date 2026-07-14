import { eq } from "drizzle-orm";
import { db } from "@/db";
import { artifacts as artifactsTable, conversations } from "@/db/schema";
import { pendingGateAfterTurn } from "@/lib/agent/gate-reengage";
import type { ConversationMetadata, Persona } from "@/lib/agent/personas";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT } from "@/lib/agent/qualify-config";
import { decideShowGate, gateAwaitingReply, nextGate, type UserIntent } from "@/lib/agent/qualify-state";
import type { ArtifactType } from "@/lib/chat/types";
import { loadAdministradoraLogoMap } from "@/lib/consorcio/administradora-logo-repo";
import { loadConversationHistory, saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta, reloadMeta } from "@/lib/conversation/meta";
import {
	loadMemoryContextForTurn,
	memorySystemMessageFromContext,
	resolveIdentityForTurn,
	storeMemoriesForTurn,
} from "@/lib/memory/orchestrator-bridge";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { getOrCreateConversation } from "@/lib/whatsapp/session";
import { analyzeAndMerge } from "./analyze";
import { listShownOffersForConversation, resolveOfferMentionForConversation } from "./choose-offer";
import { isLikelyNameResponse } from "./detect-name-turn";
import { computeMoneyAnchor, offerSnapshotFromArtifact } from "./dial-payload";
import {
	buildAdvanceToContractDirective,
	buildDecisionPromptDirective,
	buildDiscoveryFailedFallback,
	buildFirstRevealCardIntro,
	buildFirstRevealRecoveryFallback,
	buildLanceSoParcelaDirective,
	buildRecoConsentAcceptedDirective,
	buildScarcityDirective,
	buildSearchSummaryDirective,
	buildSimulatorDialDirective,
	buildToolErrorRecoveryExactnessFallback,
	buildToolErrorRecoveryFallback,
	buildToolErrorRecoveryFallbackRepeat,
	buildToolErrorRecoveryResolvedFallback,
	buildWhatsappOptinDirective,
	isExactnessOrCriteriaQuestion,
	TWO_PATHS_FOLLOWUP_TEXT,
} from "./directives";
import { gateStuckDefaultNotice } from "./gate-questions";
import { runLeadCollectionTurn } from "./lead-collection";
import {
	buildRecommendationCardFromRevealGroup,
	pickBestRankedGroup,
} from "./recommendation-payload";
import { decideRouting, resolveIntraCategorySwitch } from "./routing";
import { runAgentTurn, scoringInputFromMeta } from "./runner";
import {
	buildDecisionPromptCard,
	buildEmbeddedBidCard,
	buildScarcityCard,
	buildTopicPickerCard,
	buildTwoPathsCard,
	buildWhatsappOptinCard,
} from "./server-cards";
import { buildSystemContext } from "./system-context";
import { revealValueTargetChanged } from "./tool-policy";
import { planTransition, yieldTransitionAbort } from "./transition";
import type { Channel, ChatMessage, TurnEvent, TurnInput } from "./types";
import { shouldEmitWhatsappOptin } from "./whatsapp-optin-guard";

export type { TurnEvent, TurnInput } from "./types";

// FIX-260 (rodada 5, veredito Fable r4): heurística determinística de sim/não
// em texto livre — usada SÓ pra consumir os gates lance-embutido/
// simulator-offer/reco-consent quando a resposta vem digitada (nunca por
// clique, que já tem handler próprio em route.ts). Lei 4: invariante de gate
// vira código, não regra-no-prompt. `intent` (do analyzer) filtra pergunta/
// dúvida/off-topic ANTES do regex — mesmo critério que decideShowGate já usa
// pra esses gates.
//
// FIX-308 (rodada 10, onda 4): "pode"/"mostra"/"mostrar" entraram — variantes
// comuns de aceite a um CONVITE ("Posso te mostrar a opção que eu
// recomendo?" → "Pode mostrar"/"Pode"/"Mostra aí") que o dossiê real da
// Madalena provou não estarem cobertas (o hero só liberou 6 turnos depois,
// em "quero"). Risco de falso-positivo de "pode" sozinho é mitigado pelo
// filtro de `intent` acima (pergunta/dúvida nunca chegam no regex).
const YES_TEXT_MARKERS =
	/\b(sim|quero|considero|considerar|pode|pode ser|mostra|mostrar|topo|bora|vamos|manda ver|isso mesmo|show|beleza|claro|positivo|certo|ok)\b/i;
const NO_TEXT_MARKERS = /\bn[ãa]o\b/i;

function detectYesNoText(text: string, intent: UserIntent): boolean | null {
	if (
		intent === "asking_question" ||
		intent === "expressing_doubt" ||
		intent === "off_topic" ||
		intent === "wants_more_options"
	) {
		return null;
	}
	const t = text.trim();
	if (!t) return null;
	if (NO_TEXT_MARKERS.test(t)) return false;
	if (YES_TEXT_MARKERS.test(t)) return true;
	return null;
}

/** FIX-246 (rodada 3, Fable r2 — causa-raiz do veredito 4/10): emite um card
 * SERVER-SIDE determinístico no caminho de TEXTO LIVRE (whatsapp + web) —
 * espelha `pipeServerArtifact` do adapter web, mas em generator (o consumidor
 * de cada canal já sabe tratar `TurnEvent` do tipo "artifact" uniformemente).
 * Nunca depende de o LLM chamar `present_X`. */
async function* emitServerCard(args: {
	conversationId: string;
	channel: Channel;
	persona: Persona;
	artifactType: ArtifactType;
	payload: Record<string, unknown>;
}): AsyncGenerator<TurnEvent> {
	const { conversationId, channel, persona, artifactType, payload } = args;
	const messageId = await saveMessage(
		conversationId,
		"assistant",
		`[card: ${artifactType}]`,
		channel,
		persona,
	);
	await db.insert(artifactsTable).values({
		messageId,
		type: artifactType,
		payload,
		createdAt: simulatorNow(),
	});
	yield { type: "artifact", artifactType, payload, toolCallId: crypto.randomUUID() };
}

/** BUG-REVEAL-LOOP + FIX-331 (rodada 10): dirige o card de decisão ("Esse
 * plano faz sentido?" ou, no ramo so_parcela, `two_paths`) UMA vez — fim do
 * passo 4 da jornada → abre o passo 5 (contratar). Directive determinístico +
 * guard de idempotência (`decisionDispatched`).
 *
 * Extraído em função própria (FIX-331, veredito Sonnet A.8/A.9 — achado ao
 * vivo confirmado em produção) pra ser chamada tanto do caminho PÓS-modelo
 * (`nextGateToFire==="decision"`, computado por `runner.ts` depois do LLM
 * rodar) quanto de um intercepto PRÉ-modelo (mais abaixo nesta função): sem
 * o intercepto, o modelo — ainda no toolset da fase "reveal", já que
 * `decisionDispatched` continua false — às vezes tentava avançar sozinho
 * (`present_contract_form`/`present_decision_prompt`, tools fora da fase),
 * gerando um `tool_error` que SUPRIME TODA a computação de gate do turno
 * (guard do tool-error-recovery) — e como o gate nunca avançava, o funil
 * travava definitivamente depois do simulador quando o usuário confirmava
 * por TEXTO LIVRE em vez de clicar (achado ao vivo: nenhum `contract_form`/
 * `decision_prompt` jamais persistido na conversa reproduzida). */
async function* dispatchDecisionCascade(args: {
	conversationId: string;
	channel: Channel;
	currentPersona: Persona;
	knownName: string | null;
}): AsyncGenerator<TurnEvent> {
	const { conversationId, channel, currentPersona, knownName } = args;
	const refreshed = await reloadMeta(conversationId);
	if (refreshed.decisionDispatched) {
		yield { type: "finish", reason: "decision-already-dispatched" };
		return;
	}
	await persistMeta(conversationId, { ...refreshed, decisionDispatched: true });
	// FIX-272 (rodada 8, veredito Fable r7, D4 residual — "outra emenda"): a
	// resposta do turno PRINCIPAL (às vezes termina em pergunta, ex. "...outro
	// prazo?") colava SEM espaço no lead-in do directive seguinte (scarcity OU
	// so_parcela, logo abaixo) — mesma classe do FIX-268, que só fechava a
	// costura MAIS ADIANTE (entre scarcity e decision_prompt). Fecha o balão
	// aberto incondicionalmente ANTES de entrar em QUALQUER ramo deste bloco
	// (no-op se já não houver balão aberto) — cobre os dois caminhos de uma vez.
	yield { type: "text-boundary" };
	// FIX-233 — 3ª saída do gate `lance` ("só a parcela") chega aqui pulando
	// lance-value/lance-embutido/simulator-offer; o card certo é
	// present_two_paths (dois caminhos), não present_decision_prompt.
	const isSoParcela = refreshed.qualifyAnswers?.hasLance === "so_parcela";
	// FIX-237 (Fable r1, D2.1 gap #3): scarcity era ÓRFÃO. Dispara depois da
	// estratégia de lance resolvida, ANTES do card de decisão — só no
	// caminho normal (o so_parcela vai direto pro two_paths, sem o gancho
	// de escassez, spec `04-copy-fluxos.md` Fluxo B).
	// FIX-246 (rodada 3, Fable r2): o directive SÓ escreve o texto — o card
	// é emissão SERVER-SIDE determinística (emitServerCard), nunca depende
	// de tool-call do LLM.
	if (!isSoParcela) {
		yield* runTurn({
			channel,
			conversationId,
			userText: buildScarcityDirective(),
			isUserTurn: false,
			contactName: knownName,
			skipAnalyzer: true,
			skipLeadCollection: true,
		});
		const scarcityCard = buildScarcityCard(refreshed);
		if (scarcityCard) {
			yield* emitServerCard({
				conversationId,
				channel,
				persona: currentPersona,
				artifactType: "scarcity",
				payload: scarcityCard.payload,
			});
		}
		// FIX-268 (rodada 7, veredito Fable r6, residual D4 — "texto
		// picotado no turno de decisão"): quando scarcityCard é null (sem
		// groupId ancorado), NENHUM artifact separa o texto do directive de
		// scarcity do texto do directive de decision logo abaixo — os dois
		// caem no MESMO balão, colados sem espaçamento ("...só pra você
		// saber:Boa! Então deixa eu confirmar com você:"). Força o boundary
		// incondicionalmente (no-op quando o artifact já fechou o balão).
		yield { type: "text-boundary" };
	}
	const directive = isSoParcela ? buildLanceSoParcelaDirective() : buildDecisionPromptDirective();
	yield* runTurn({
		channel,
		conversationId,
		userText: directive,
		isUserTurn: false,
		contactName: knownName,
		skipAnalyzer: true,
		skipLeadCollection: true,
	});
	if (isSoParcela) {
		yield* emitServerCard({
			conversationId,
			channel,
			persona: currentPersona,
			artifactType: "two_paths",
			payload: buildTwoPathsCard(refreshed).payload,
		});
		yield { type: "text-delta", text: TWO_PATHS_FOLLOWUP_TEXT };
		await saveMessage(conversationId, "assistant", TWO_PATHS_FOLLOWUP_TEXT, channel, currentPersona);
	} else {
		// FIX-253 (rodada 4, veredito Fable FINAL §3): present_decision_prompt
		// saiu do toolset (tool-policy.ts) — o card sai SERVER-SIDE
		// determinístico aqui, no ÚNICO ramo que dirige a decisão. Nunca mais
		// depende do LLM chamar a tool (mesma receita do scarcity acima).
		yield* emitServerCard({
			conversationId,
			channel,
			persona: currentPersona,
			artifactType: "decision_prompt",
			payload: buildDecisionPromptCard(refreshed).payload,
		});
	}
}

export async function* runTurn(input: TurnInput): AsyncGenerator<TurnEvent> {
	const {
		channel,
		conversationId: providedConversationId,
		userText,
		isUserTurn,
		contactName,
		skipAnalyzer,
		skipLeadCollection,
		userIntent: providedIntent,
		userKey,
		suppressGateEvent,
		forceToolChoice: callerForceToolChoice,
	} = input;

	const conversationId = providedConversationId;
	if (!conversationId) {
		throw new Error("[orchestrator] conversationId is required");
	}

	if (channel === "whatsapp" && contactName) {
		const existing = await db.query.conversations.findFirst({
			where: eq(conversations.id, conversationId),
		});
		if (existing && contactName !== existing.contactName) {
			await db
				.update(conversations)
				.set({ contactName, updatedAt: simulatorNow() })
				.where(eq(conversations.id, conversationId));
		}
	}

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const currentPersona: Persona = meta.currentPersona ?? "concierge";
	const knownName = contactName ?? conv?.contactName ?? null;

	if (isUserTurn && meta.handoffSuggested) {
		await saveMessage(conversationId, "user", userText, channel);
		yield { type: "handoff", reason: meta.handoffReason ?? "trigger satisfied" };
		yield { type: "finish", reason: "handoff-pending" };
		return;
	}

	if (isUserTurn && !skipLeadCollection && meta.leadCollection) {
		yield* runLeadCollectionTurn({ conversationId, channel, text: userText, meta, userKey });
		yield { type: "finish", reason: "lead-collection" };
		return;
	}

	let newlyExtractedExperience: ConversationMetadata["experiencePrev"] | null = null;
	let analyzedIntent = providedIntent ?? "neutral";

	if (isUserTurn && !skipAnalyzer) {
		// FIX-260 (rodada 5, veredito Fable r4): snapshot do gate ativo ANTES do
		// merge do analyzer — mesmo padrão do FIX-236 (activeGateAtTurnStart em
		// analyze.ts) pra restringir a captura de texto livre ao gate REALMENTE
		// pendente neste turno (nunca herda "sim" de outro contexto).
		const activeGateAtTurnStart = nextGate(meta, { hasContactName: Boolean(knownName) });
		const {
			analysis,
			metaChanged,
			newlyExtractedExperience: extracted,
			stuckGateDefaultApplied,
		} = await analyzeAndMerge(userText, currentPersona, meta);
		newlyExtractedExperience = extracted;
		analyzedIntent = analysis.userIntent;

		if (metaChanged) {
			await persistMeta(conversationId, meta);
			yield { type: "meta-update", meta };
		}

		// FIX-305: o teto de tentativas sem progresso foi atingido neste turno —
		// o default já foi assumido (persistido acima, junto com metaChanged) e o
		// funil vai avançar pro próximo gate mais adiante nesta mesma função.
		// Avisa o usuário ANTES do resto do turno, texto determinístico (mesmo
		// padrão de TWO_PATHS_FOLLOWUP_TEXT/SPECIALIST_EXIT_OFFER) — nunca finge
		// que o dado veio dele.
		if (stuckGateDefaultApplied) {
			const notice = gateStuckDefaultNotice(stuckGateDefaultApplied, meta.qualifyAnswers ?? {});
			if (notice) {
				yield { type: "text-delta", text: notice };
				await saveMessage(conversationId, "assistant", notice, channel, currentPersona);
				yield { type: "text-boundary" };
			}
		}

		// FIX-260: gate lance-embutido respondido por TEXTO LIVRE não era
		// CONSUMIDO — só o clique (route.ts) setava qualifyAnswers.lanceEmbutido;
		// nextGate() devolvia "lance-embutido" pra sempre e o disparo automático
		// (abaixo) reemitia o card embedded_bid + a educação a cada turno (loop
		// até o usuário clicar).
		if (
			activeGateAtTurnStart === "lance-embutido" &&
			meta.qualifyAnswers?.lanceEmbutido === undefined
		) {
			const answer = detectYesNoText(userText, analyzedIntent);
			if (answer !== null) {
				meta.qualifyAnswers = {
					...(meta.qualifyAnswers ?? {}),
					lanceEmbutido: answer,
					lanceEmbutidoPercent: answer ? LANCE_EMBUTIDO_DEFAULT_PERCENT : undefined,
				};
				await persistMeta(conversationId, meta);
			}
		}

		// FIX-260: "Quero ver sim!" (texto) no gate simulator-offer pulava o dial
		// — simulatorOfferDispatched já marcado na EMISSÃO faz nextGate() avançar
		// direto pro "decision" na resposta seguinte, sem nunca chamar o directive
		// do dial (só o clique, route.ts, disparava present_contemplation_dial).
		// Mesma janela do clique "Quero ver!": já mostrado, ainda sem decision,
		// ainda sem resposta registrada (idempotência via simulatorOfferAnswered).
		if (
			meta.simulatorOfferDispatched === true &&
			meta.decisionDispatched !== true &&
			meta.simulatorOfferAnswered !== true &&
			detectYesNoText(userText, analyzedIntent) === true
		) {
			meta.simulatorOfferAnswered = true;
			await persistMeta(conversationId, meta);
			await saveMessage(conversationId, "user", userText, channel);
			// FIX-241 (âncora de dinheiro): mesmo cálculo do clique — quando o
			// usuário declarou poupança mensal, narra o mês em que o BOLSO
			// alcança o lance.
			const moneyAnchor =
				computeMoneyAnchor(meta.recommendedOffer, {
					monthlySavings: meta.qualifyAnswers?.monthlySavings,
					lanceValue: meta.qualifyAnswers?.lanceValue,
					fgtsValue: meta.qualifyAnswers?.fgtsValue,
				}) ?? undefined;
			yield* runTurn({
				channel,
				conversationId,
				userText: buildSimulatorDialDirective({
					administradora: meta.recommendedAdministradora,
					moneyAnchor,
				}),
				isUserTurn: false,
				contactName: knownName,
				skipAnalyzer: true,
				skipLeadCollection: true,
			});
			return;
		}

		// FIX-297 (rodada 10, 2026-07-12): resposta AFIRMATIVA por TEXTO ao gate
		// `reco-consent` libera o hero pendente (recommendation_card +
		// simulation_result, se houver) — computado no turno da busca original e
		// guardado em meta (Lei 1: nunca recalculado, nunca dependente de nova
		// tool-call do LLM). Mesmo mecanismo do simulator-offer/lance-embutido
		// (detectYesNoText) acima. Sem hero pendente (ex.: 1 grupo só, que nunca
		// entra na ceremônia de consentimento), só avança normalmente.
		//
		// FIX-308 (rodada 10, onda 4): `intent==="ready_to_proceed"` também conta
		// como consentimento, mesmo quando o texto foge do YES_TEXT_MARKERS (ex.:
		// "bora, quero fechar logo" — já capturado pelo regex, mas cobre gírias
		// novas que o analyzer reconheça com confiança sem precisar de mais uma
		// entrada no regex). Só se aplica enquanto este gate está mesmo pendente
		// (recoConsentDispatched && !recoConsentAnswered) — nunca sequestra um
		// "ready_to_proceed" de outro contexto.
		//
		// FIX-325 (rodada 10, veredito Sonnet A.5 + decisão de produto do Kairo,
		// AskUserQuestion 2026-07-13): nomear uma administradora JÁ EXIBIDA no
		// comparison_table (ex.: "A Canopus parece boa, parcela baixa") TAMBÉM é
		// consentimento inequívoco — sem isso, `recoConsentAnswered` ficava
		// PARA SEMPRE undefined nesse padrão de resposta, travando toda a
		// cascata pós-reveal (nextGate() nunca sai de "reco-consent") até o
		// usuário clicar um botão de fast-path independente (achado ao vivo,
		// dossiê Mario). Mesmo guard de intent do `detectYesNoText` (pergunta/
		// dúvida/off-topic/quer-mais-opções nunca contam) — reusa a resolução
		// por menção já provada em resolveOfferMentionForConversation
		// (FIX-258/263): só resolve contra oferta JÁ ANCORADA em tela, nunca
		// inventa.
		const recoConsentGatePending =
			meta.recoConsentDispatched === true && meta.recoConsentAnswered !== true;
		const excludedIntentForConsent =
			analyzedIntent === "asking_question" ||
			analyzedIntent === "expressing_doubt" ||
			analyzedIntent === "off_topic" ||
			analyzedIntent === "wants_more_options";
		const mentionedOfferForConsent =
			recoConsentGatePending && !excludedIntentForConsent
				? await resolveOfferMentionForConversation(conversationId, userText)
				: null;
		if (
			recoConsentGatePending &&
			(detectYesNoText(userText, analyzedIntent) === true ||
				analyzedIntent === "ready_to_proceed" ||
				mentionedOfferForConsent !== null)
		) {
			meta.recoConsentAnswered = true;
			await persistMeta(conversationId, meta);
			await saveMessage(conversationId, "user", userText, channel);
			if (meta.pendingRecommendationCard) {
				yield* runTurn({
					channel,
					conversationId,
					userText: buildRecoConsentAcceptedDirective(),
					isUserTurn: false,
					contactName: knownName,
					skipAnalyzer: true,
					skipLeadCollection: true,
				});
				yield* emitServerCard({
					conversationId,
					channel,
					persona: currentPersona,
					artifactType: "recommendation_card",
					payload: meta.pendingRecommendationCard,
				});
				if (meta.pendingSimulationResult) {
					yield* emitServerCard({
						conversationId,
						channel,
						persona: currentPersona,
						artifactType: "simulation_result",
						payload: meta.pendingSimulationResult,
					});
				}
			}
			return;
		}

		// FIX-331 (rodada 10, veredito Sonnet A.8/A.9 — achado ao vivo, root
		// cause confirmada em produção): depois do simulador (dial) responder
		// por TEXTO LIVRE (`simulatorOfferAnswered=true`), se o usuário segue
		// confirmando por texto livre em vez de clicar um botão, `nextGate()`
		// já aponta "decision" — mas só o cálculo TARDIO (pós-modelo, em
		// `runner.ts`) disparava esse gate. Nesse meio-tempo, o modelo (ainda
		// no toolset da fase "reveal", já que `decisionDispatched` continua
		// false) às vezes tenta avançar sozinho (`present_contract_form`/
		// `present_decision_prompt`) — tool FORA da policy, `tool_error`, que
		// SUPRIME TODA a computação de gate desse turno (guard do
		// tool-error-recovery). Como o gate nunca avança, o PRÓXIMO turno
		// reproduz o MESMO problema pra sempre — achado ao vivo: a conversa
		// trava definitivamente depois do dial, nunca mais fecha por texto
		// (confirmado no Postgres real: nenhum contract_form/decision_prompt
		// jamais persistido). Intercepta ANTES de chamar o modelo — mesmo
		// padrão do FIX-260 (simulator-offer)/FIX-297 (reco-consent) acima —
		// usando as MESMAS funções puras (nextGate/decideShowGate) que o
		// cálculo tardio já usa, sem duplicar lógica de decisão nova. O
		// modelo NUNCA chega a rodar neste turno — o card sai determinístico,
		// sem risco de tool-error.
		if (
			meta.revealCompleted === true &&
			meta.decisionDispatched !== true &&
			nextGate(meta, { hasContactName: Boolean(knownName) }) === "decision" &&
			decideShowGate({ gate: "decision", intent: analyzedIntent, meta, isUserTurn: true })
		) {
			await saveMessage(conversationId, "user", userText, channel);
			yield* dispatchDecisionCascade({ conversationId, channel, currentPersona, knownName });
			return;
		}

		const decision = decideRouting(userText, meta, analysis);
		if (decision.kind === "transition") {
			if (decision.usedFallback) {
				console.log(
					`[orchestrator] Analyzer missed category — regex fallback detected "${decision.toCategory}" in: "${userText.slice(0, 80)}"`,
				);
			}
			await saveMessage(conversationId, "user", userText, channel);
			yield* runTransitionAndContinue({
				conversationId,
				fromPersona: currentPersona,
				toCategory: decision.toCategory,
				expertiseHint: analysis.detectedSubTopic,
				channel,
				contactName: knownName,
			});
			return;
		}

		const intraCategoryTarget = await resolveIntraCategorySwitch(meta, analysis);
		if (intraCategoryTarget) {
			console.log(
				`[orchestrator] Intra-category swap: ${meta.currentPersona} → expertise="${analysis.detectedSubTopic}" in category=${intraCategoryTarget}`,
			);
			await saveMessage(conversationId, "user", userText, channel);
			yield* runTransitionAndContinue({
				conversationId,
				fromPersona: currentPersona,
				toCategory: intraCategoryTarget,
				expertiseHint: analysis.detectedSubTopic,
				channel,
				contactName: knownName,
			});
			return;
		}

		// FIX-239 (Fable r1, D3.4, gap P1 #6b): re-pedido de avanço em TEXTO
		// LIVRE depois que o card de decisão já foi mostrado uma vez ("quero
		// seguir com esse plano") batia no guard isDecisionDup
		// (artifact-guard.ts) — o LLM anunciava "deixa eu confirmar com você:"
		// e o present_decision_prompt duplicado era suprimido, virando turno
		// morto (promessa sem entrega, família FIX-206/207). Roteamento
		// DETERMINÍSTICO: ready_to_proceed pós-decisão avança direto pro passo
		// 5 — mesma directive do clique "Tenho interesse" (route.ts).
		if (
			meta.decisionDispatched === true &&
			meta.contractClosed !== true &&
			analysis.userIntent === "ready_to_proceed"
		) {
			await saveMessage(conversationId, "user", userText, channel);
			// FIX-319 (rodada 10, onda 4 — veredito Sonnet, P0): sem este guard,
			// este caminho e o clique "Tenho interesse" (route.ts) podiam disparar
			// `buildAdvanceToContractDirective` em turnos CONSECUTIVOS — achado ao
			// vivo (dossiê Madalena, turnos 18→19): 2 `contract_form` seguidos.
			// `contractFormDispatched` já persiste assim que o 1º aparece
			// (runner.ts:1244-1246) — reafirma o formulário JÁ mostrado em vez de
			// pedir de novo.
			if (meta.contractFormDispatched === true) {
				const notice = "Você já viu o formulário aqui em cima — é só preencher pra eu seguir!";
				yield { type: "text-delta", text: notice };
				await saveMessage(conversationId, "assistant", notice, channel, currentPersona);
				yield { type: "text-boundary" };
				return;
			}
			yield* runTurn({
				channel,
				conversationId,
				userText: buildAdvanceToContractDirective({
					administradora: meta.recommendedAdministradora,
				}),
				isUserTurn: false,
				contactName: knownName,
				skipAnalyzer: true,
				skipLeadCollection: true,
			});
			return;
		}
	}

	if (isUserTurn) {
		await saveMessage(conversationId, "user", userText, channel);
	}

	// DESAMARRA (2026-07-13, ADR revoga-jornada-soberana): o antigo FIX-301
	// CURTO-CIRCUITAVA o "não entendi" — respondia com um texto fixo
	// (CLARIFY_LEAD_IN) e REPETIA a pergunta canônica do mesmo gate, sem nunca
	// invocar o modelo. Era a causa direta do sintoma que o Kairo reportou: "o
	// agente responde sempre a mesma coisa". Um usuário que não entendeu e
	// recebe a MESMA frase de volta não é um produto — é um loop.
	//
	// Agora: o modelo responde, e o servidor só INFORMA o que ainda falta
	// descobrir (`confusedAboutGate` → systemContext), pedindo que ele reformule
	// de outro jeito. O invariante segue intacto — o gate continua pendente e o
	// funil não avança sem o dado; só a FALA voltou a ser do modelo.
	const confusedAboutGate =
		isUserTurn && !skipAnalyzer && analyzedIntent === "confused"
			? gateAwaitingReply(meta, Boolean(knownName))
			: null;

	// FIX-258 (P1, veredito Fable r4 §P1 #1 — FIX-252 "NÃO", rota nome→grupo
	// ausente ANTES da tool-call): resolve a menção textual do usuário (nome de
	// administradora ou valor aproximado, ex. "quero a ITAÚ"/"a de 92 mil")
	// CONTRA os grupos JÁ EXIBIDOS em tela — antes de montar o prompt/deixar a
	// LLM decidir sozinha. resolveOfferMentionForConversation nunca inventa
	// (null sem match claro ou ambíguo); a diretiva só entra no systemContext
	// quando há match real. Rota determinística, Lei 1/4.
	const mentionedOffer = isUserTurn
		? await resolveOfferMentionForConversation(conversationId, userText)
		: null;

	// FIX-263 (P1, veredito Fable r5, seam PARCIAL): confirmação TEXTUAL de uma
	// oferta JÁ EXIBIDA nunca re-ancorava `recommendedOffer`/`recommendedAdministradora`
	// — só o clique (choose_offer, route.ts) fazia isso. Resultado ao vivo: o
	// usuário confirmou ITAÚ 92.902 por texto 3×, mas o hero/aviso de troca de
	// marca no fechamento seguiu nomeando a ÂNCORA (snapshot stale) — porque
	// NADA persistia a resolução textual quando o turno não produzia um novo
	// simulation_result (FIX-252 só re-ancora nesse caso, dentro do runner).
	// Mesma re-ancoragem determinística do clique, aqui pro caminho de TEXTO —
	// só pós-reveal (há algo mostrado pra re-ancorar) e só com os 3 números da
	// oferta mencionada completos (nunca ancora parcial, Lei 3).
	if (
		isUserTurn &&
		mentionedOffer &&
		meta.revealCompleted === true &&
		typeof mentionedOffer.creditValue === "number" &&
		typeof mentionedOffer.termMonths === "number" &&
		typeof mentionedOffer.monthlyPayment === "number" &&
		mentionedOffer.groupId !== meta.recommendedOffer?.groupId
	) {
		meta.recommendedAdministradora =
			mentionedOffer.administradora ?? meta.recommendedAdministradora;
		meta.recommendedOffer = {
			...meta.recommendedOffer,
			administradora: mentionedOffer.administradora ?? meta.recommendedOffer?.administradora,
			creditValue: mentionedOffer.creditValue,
			termMonths: mentionedOffer.termMonths,
			monthlyPayment: mentionedOffer.monthlyPayment,
			groupId: mentionedOffer.groupId,
		};
		await persistMeta(conversationId, meta);
		console.log(
			`[ancora-fechamento] FIX-263: confirmação textual re-ancorou recommendedOffer pra ${meta.recommendedAdministradora} (groupId=${mentionedOffer.groupId}, conv=${conversationId})`,
		);
	}

	// DESAMARRA (2026-07-13): o antigo FIX-282/293 respondia "por que essa e não
	// outra?" com um texto 100% PRÉ-FABRICADO, sem invocar o modelo. O medo era
	// legítimo (o modelo fabricava números), mas a cura matou o paciente: a
	// pergunta mais importante de uma venda consultiva recebia um template
	// idêntico toda vez.
	//
	// A correção certa não é responder pelo modelo — é DAR A ELE OS NÚMEROS
	// REAIS e deixá-lo redigir (`exactnessFacts` → systemContext). O invariante
	// "nunca inventar número" continua garantido, porque o número vem do
	// servidor; só a redação voltou pro modelo.
	const exactnessFacts =
		isUserTurn &&
		meta.revealCompleted === true &&
		isExactnessOrCriteriaQuestion(userText) &&
		typeof meta.recommendedOffer?.creditValue === "number"
			? {
					administradora: meta.recommendedOffer.administradora,
					creditValue: meta.recommendedOffer.creditValue,
					requestedValue:
						meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax,
				}
			: null;

	const history = await loadConversationHistory(conversationId);
	// DESAMARRA: o modelo passa a SABER o que o funil quer descobrir a seguir, e
	// faz a pergunta com as palavras dele (o card então só mostra o input). Antes,
	// o servidor perguntava e o modelo era proibido de perguntar.
	const pendingGate = isUserTurn
		? nextGate(meta, { hasContactName: Boolean(knownName) })
		: null;
	const systemContext = buildSystemContext({
		knownName,
		newlyExtractedExperience,
		meta,
		mentionedOffer,
		confusedAboutGate,
		exactnessFacts,
		pendingGate,
	});

	// ─── Memory layer (Letta sidecar) ───────────────────────────────────────
	// Resolve identity, carrega contexto persistente e prepend ao prompt.
	// Em qualquer erro/timeout/circuit-open, retorna null silenciosamente —
	// orquestrador segue sem memória. Ver ADR 2026-05-16.
	const userTurnCount = history.filter((m) => m.role === "user").length;
	const identity = resolveIdentityForTurn({
		channel,
		conv,
		userKey: userKey ?? undefined,
		userTurnCount,
	});
	const memoryContext = await loadMemoryContextForTurn({ identity, userText });
	const memorySystemMessage = memorySystemMessageFromContext(memoryContext);

	// Debug hook (R9 do QA plan): quando AJA_DEBUG_MEMORY=1, persiste o hint
	// injetado no meta pra E2E inspecionar via SQL. Nunca em produção.
	if (process.env.AJA_DEBUG_MEMORY === "1") {
		const debugMeta = await reloadMeta(conversationId);
		await persistMeta(conversationId, {
			...debugMeta,
			lettaDebugHint: memorySystemMessage?.content ?? null,
		});
	}

	// FIX-77: os blocos de system dinâmicos (systemContext + a memória Letta) NÃO
	// vão mais em `messages` — system dentro de `messages` dispara o warning de
	// prompt-injection da AI SDK a cada turno. systemContext vai pro builder via
	// `instructions` (systemContextBlocks → runner → resolveAgent). A memória já
	// chega ao prompt via memoryContext → buildAgent (memoryText): prependá-la
	// aqui ALÉM disso duplicava a Letta no mesmo request. Em turno de sistema
	// (directive) só o knownName entra — espelha o comportamento anterior, sem o
	// bloco de experience/doubts (que só faz sentido respondendo o usuário).
	const systemContextBlocks: string[] = isUserTurn
		? systemContext.map((m) => m.content)
		: knownName
			? [`Nome do usuario: "${knownName}"`]
			: [];
	const messagesForAgent: ChatMessage[] = isUserTurn
		? [...history]
		: [...history, { role: "user", content: userText }];

	// NÍVEL 1 do fix BUG-SHORT-GREETING-AFTER-NAME: quando o turn atual é
	// "user respondeu nome" (turno anterior do agent perguntou nome E user
	// mandou ≤4 palavras só de letras E contactName ainda NULL), forçar
	// `save_contact_name` via toolChoice. Detecção isolada em
	// `detect-name-turn.ts` (unit test puro).
	//
	// Background: Anthropic Claude Sonnet 4-6 escapava da regra dura no
	// prompt em variantes curtas ("Prazer, Paulo!" sem tool). Forçar via
	// toolChoice é defesa em código — não depende de obediência do modelo.
	let forceToolChoice: { type: "tool"; toolName: "save_contact_name" } | "none" | undefined =
		callerForceToolChoice;
	if (!callerForceToolChoice && isUserTurn && currentPersona !== "concierge" && !skipLeadCollection) {
		// Pega o último turn do assistant no histórico salvo (já inclui o
		// turn anterior ao user-text atual).
		const lastAssistant = [...history].reverse().find((m) => m.role === "assistant");
		const previousAssistantText = lastAssistant?.content;
		const shouldForce = isLikelyNameResponse({
			previousAssistantText,
			currentUserText: userText,
			conversationContactName: knownName,
		});
		if (shouldForce) {
			forceToolChoice = { type: "tool", toolName: "save_contact_name" };
			console.log(
				`[orchestrator] force save_contact_name via toolChoice (conv=${conversationId}, user="${userText.slice(0, 40)}")`,
			);
		}
	}

	const result = yield* runAgentTurn({
		conversationId,
		channel,
		currentPersona,
		meta,
		messages: messagesForAgent,
		isUserTurn,
		userIntent: analyzedIntent,
		memoryContext,
		forceToolChoice,
		systemContextBlocks,
	});

	// FIX-186 (Kairo 2026-07-01): a descoberta na Bevi falhou neste turno (após
	// retry silencioso). O runner suprimiu a narração crua do modelo; AQUI o
	// orchestrator materializa a mensagem amigável FIXA + convite a ação e fecha
	// o turno — determinístico (Lei 1), no padrão do yieldTransitionAbort. Nunca
	// deixa o LLM decidir o que falar no erro; nunca emite proposta (FIX-187).
	if (result.discoveryFailedThisTurn) {
		const fallback = buildDiscoveryFailedFallback({ name: knownName });
		yield { type: "text-delta", text: fallback };
		await saveMessage(conversationId, "assistant", fallback, channel, currentPersona);
		yield { type: "finish", reason: "discovery-failed" };
		return;
	}

	// FIX-262 (P1, veredito Fable r5, causa-raiz N1/N2): o runner detectou uma
	// tool chamada fora do toolset da fase (tool-error) ou o turno estourou o
	// cap duro de tool-calls — nos dois casos a narração do modelo foi
	// suprimida (tenderia a negar uma oferta real). O orchestrator materializa
	// o fallback FIXO que reafirma as opções já mostradas, nunca as nega
	// (Lei 1: código dispõe, mesmo padrão do discoveryFailedThisTurn acima).
	//
	// FIX-266 (P1, veredito Fable r6, "o que segura o 7" #1): o fallback
	// enlatado pedia "me diz o nome" mesmo quando `mentionedOffer` (resolvido
	// acima, ANTES do turno, contra os grupos JÁ EXIBIDOS) já apontava pra
	// exatamente a oferta que o usuário citou — contenção sem resolução.
	// Quando resolve, reafirma os dados dela em vez de pedir de novo. Quando
	// não resolve e o ÚLTIMO turno do assistant já foi esse mesmo fallback
	// genérico, troca pra variante que lista as opções concretas — nunca
	// repete a frase idêntica 2× seguidas.
	if (result.toolErrorThisTurn || result.toolCallCapExceededThisTurn) {
		// FIX-286 (P0, veredito Sonnet r9pos2 §3): a família FIX-262/266/282
		// abaixo foi desenhada e testada só pro cenário de REPETIÇÃO pós-reveal
		// (`meta.revealCompleted === true` — "as opções que já apareceram
		// continuam valendo" É verdade nesse caso). Quando o guard interrompe a
		// PRIMEIRA apresentação do turno (`!meta.revealCompleted`), essa frase
		// é uma MENTIRA — nada tinha aparecido ainda. `result.revealGroupsById`
		// (exposto pelo runner mesmo no early-return do guard) diz se
		// `search_groups`/`recommend_groups` já retornaram grupos reais neste
		// turno: com ranking real (`recommend_groups` rodou, `pickBestRankedGroup`
		// acha o de maior score — a mesma escolha server-computed que
		// `present_recommendation_card` teria mostrado), materializa o
		// `recommendation_card` (Via A, reaproveita `coerceRecommendationPayload`,
		// mesma coerção do caminho feliz); sem ranking suficiente (ex.: só
		// `search_groups` rodou), honesto D10 de retry (Via B) — nunca "já
		// apareceram".
		if (!meta.revealCompleted) {
			const bestGroup = result.revealGroupsById
				? pickBestRankedGroup(result.revealGroupsById)
				: null;
			if (bestGroup) {
				const requestedCreditValue =
					meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax;
				const logos = await loadAdministradoraLogoMap().catch(() => new Map<string, string>());
				const payload = buildRecommendationCardFromRevealGroup(
					bestGroup,
					logos,
					requestedCreditValue,
					scoringInputFromMeta(meta),
				);
				const intro = buildFirstRevealCardIntro({ name: knownName });
				yield { type: "text-delta", text: intro };
				await saveMessage(conversationId, "assistant", intro, channel, currentPersona);
				yield* emitServerCard({
					conversationId,
					channel,
					persona: currentPersona,
					artifactType: "recommendation_card",
					payload,
				});
				const refreshed = await reloadMeta(conversationId);
				if (!refreshed.revealCompleted) {
					const offerSnapshot = offerSnapshotFromArtifact(payload);
					await persistMeta(conversationId, {
						...refreshed,
						revealCompleted: true,
						searchDispatched: true,
						recommendedAdministradora:
							typeof payload.administradora === "string"
								? payload.administradora
								: refreshed.recommendedAdministradora,
						...(typeof refreshed.qualifyAnswers?.creditMax === "number"
							? { discoveredCreditTarget: refreshed.qualifyAnswers.creditMax }
							: {}),
						...(offerSnapshot ? { recommendedOffer: offerSnapshot } : {}),
					});
				}
				yield { type: "finish", reason: "reveal-recovered" };
				return;
			}
			const recoveryFallback = buildFirstRevealRecoveryFallback({ name: knownName });
			yield { type: "text-delta", text: recoveryFallback };
			await saveMessage(conversationId, "assistant", recoveryFallback, channel, currentPersona);
			yield {
				type: "finish",
				reason: result.toolCallCapExceededThisTurn
					? "tool-call-cap-exceeded"
					: "tool-error-recovered",
			};
			return;
		}

		let fallback: string;
		// FIX-282 (P1, veredito Sonnet r9pos, G-B/I2): a pergunta do usuário
		// sobre EXATIDÃO/CRITÉRIO da oferta já mostrada ("é de 120 mil como
		// pedi? por que essa e não outra?") tem resposta factual pronta em
		// `meta.recommendedOffer` — checa ANTES do fallback genérico/resolvido
		// (que são cegos ao conteúdo da pergunta) pra nunca deixar essa
		// pergunta específica sem resposta honesta. `isUserTurn` mesma guarda
		// de `mentionedOffer` — directive interno nunca aciona isto.
		if (
			isUserTurn &&
			isExactnessOrCriteriaQuestion(userText) &&
			typeof meta.recommendedOffer?.creditValue === "number"
		) {
			fallback = buildToolErrorRecoveryExactnessFallback({
				name: knownName,
				offer: meta.recommendedOffer,
				rawCreditValue: meta.qualifyAnswers?.creditClampedFrom ?? meta.qualifyAnswers?.creditMax,
			});
		} else if (mentionedOffer) {
			fallback = buildToolErrorRecoveryResolvedFallback({ name: knownName, offer: mentionedOffer });
		} else {
			const generic = buildToolErrorRecoveryFallback({ name: knownName });
			// FIX-332 (P2.7, veredito rodada 1): o guard só comparava com o ÚLTIMO
			// turno do assistant — com um turno diferente entre as duas ocorrências,
			// a MESMA frase enlatada podia voltar não-consecutiva (auto t10/t15 do
			// veredito). Agora varre TODO o histórico do assistant nesta conversa.
			const genericAlreadyUsed = history.some(
				(m) => m.role === "assistant" && m.content === generic,
			);
			fallback = genericAlreadyUsed
				? buildToolErrorRecoveryFallbackRepeat({
						name: knownName,
						offers: await listShownOffersForConversation(conversationId),
					})
				: generic;
		}
		yield { type: "text-delta", text: fallback };
		await saveMessage(conversationId, "assistant", fallback, channel, currentPersona);
		yield {
			type: "finish",
			reason: result.toolCallCapExceededThisTurn
				? "tool-call-cap-exceeded"
				: "tool-error-recovered",
		};
		return;
	}

	// Fire-and-forget — extrai fatos do turno e persiste no Letta.
	// Não awaitamos: turno responde mais rápido; se store falhar, próximo turno
	// re-extrai do meta corrente.
	void storeMemoriesForTurn({
		identity,
		artifacts: result.artifacts,
		meta,
		channel,
		userText,
		conversationId,
	});

	if (result.handoffSignaled) {
		yield { type: "finish", reason: "handoff" };
		return;
	}

	if (result.isConcierge) {
		yield { type: "welcome-categories" };
	}

	// FIX-309 (rodada 10 onda 4, investigação de causa-raiz): `topic_picker`
	// (menu de dúvidas: lance/sorteio/contemplação/cartas variam) tinha 0
	// emissões em 2 dossiês limpos — dependia do LLM chamar `present_topic_
	// picker` espontaneamente (mesma classe de bug do FIX-246/253/280).
	// Ponto certo da cascata, confirmado pelo roteiro canônico
	// (docs/design/specs/assets/2026-07-12-aja-dois-cenarios.html, cenário
	// Madalena): pós-`experience`, quando o usuário é NOVATO
	// (`experiencePrev === "first"`) — ele não sabe o que perguntar, então o
	// menu de FAQ é oferecido proativamente. NÃO é o mesmo gatilho de
	// `experiencePrev === "doubts"` ("Tenho dúvidas"), que já tem seu próprio
	// mecanismo dedicado (`doubts-wait`/`pendingFollowUp` — resposta livre à
	// pergunta específica do usuário, sem menu). Guard duplo:
	// `recoConsentDispatched !== true` evita reabrir o card numa conversa que
	// já avançou pra reco-consent (não regride a fase); `topicPickerDispatched`
	// garante emissão única (mesmo padrão de recoConsentDispatched).
	{
		const refreshed = await reloadMeta(conversationId);
		if (
			refreshed.experiencePrev === "first" &&
			refreshed.recoConsentDispatched !== true &&
			refreshed.topicPickerDispatched !== true
		) {
			await persistMeta(conversationId, { ...refreshed, topicPickerDispatched: true });
			yield* emitServerCard({
				conversationId,
				channel,
				persona: currentPersona,
				artifactType: "topic_picker",
				payload: buildTopicPickerCard().payload,
			});
		}
	}

	// FIX-303 (rodada r10 onda 2, loop-de-goal consórcio, 2026-07-12): opt-in de
	// WhatsApp migra do pós-reveal pro FECHO — o card "Quero receber pelo
	// WhatsApp" aparecia logo após a recomendação, sem o usuário ter pedido e
	// antes de qualquer proposta apresentada (achado do teste manual com Qwen
	// 3.5 Fast). Dispara agora no MESMO turno em que present_contract_form
	// (passo 5, proposta real) aparece pela 1ª vez — nunca antes.
	// contractFormDispatched já foi persistido por runAgentTurn (runner.ts,
	// junto com o artifact contract_form) antes deste ponto; recarrega o meta
	// pra enxergar o flag (o objeto `meta` local não foi mutado por essa
	// escrita, que passa por reloadMeta/persistMeta internos ao runner).
	if (result.artifacts.some((a) => a.type === "contract_form")) {
		const postContract = await reloadMeta(conversationId);
		if (shouldEmitWhatsappOptin(postContract)) {
			await persistMeta(conversationId, { ...postContract, whatsappOptinShown: true });
			const stage = postContract.contactPhone ? "confirm" : "open";
			// FIX-318 (rodada 10, onda 4 — achado ao vivo pós-túnel, dossiê Mario):
			// mesma classe do FIX-316 (pipeClosingCeremony) — este sub-turno
			// reavaliava `nextGateToFire` de forma independente e, com reco-consent
			// ainda pendente, re-anexava "Posso te mostrar a opção que eu
			// recomendo?" NO MEIO do pedido de WhatsApp do fecho. `suppressGateEvent`
			// impede isso (mesmo padrão já usado noutros sub-turnos de fecho).
			yield* runTurn({
				channel,
				conversationId,
				userText: buildWhatsappOptinDirective(stage),
				isUserTurn: false,
				contactName: knownName,
				skipAnalyzer: true,
				skipLeadCollection: true,
				suppressGateEvent: true,
			});
			yield* emitServerCard({
				conversationId,
				channel,
				persona: currentPersona,
				artifactType: "whatsapp_optin",
				payload: buildWhatsappOptinCard(postContract).payload,
			});
		}
	}

	if (result.nextGateToFire === "search") {
		const refreshed = await reloadMeta(conversationId);
		// FIX-76: na troca de faixa (revealValueTargetChanged) a busca é uma
		// re-descoberta LEGÍTIMA da faixa nova — não pode ser barrada pelo guard de
		// idempotência do reveal original. Sem essa exceção, a retomada com
		// valor-alvo novo abortava em "search-already-dispatched" e o modelo
		// preenchia o vácuo com alucinação de "instabilidade" + valor stale.
		if (refreshed.searchDispatched && !revealValueTargetChanged(refreshed)) {
			yield { type: "finish", reason: "search-already-dispatched" };
			return;
		}
		const category = refreshed.currentCategory;
		if (!category) {
			yield { type: "finish", reason: "search-no-category" };
			return;
		}
		const directive = buildSearchSummaryDirective({ category, meta: refreshed });
		yield* runTurn({
			channel,
			conversationId,
			userText: directive,
			isUserTurn: false,
			contactName: knownName,
			skipAnalyzer: true,
			skipLeadCollection: true,
		});
		// FIX-291 (b): `searchDispatched` NÃO é mais marcado preemptivamente ANTES
		// do runTurn acima — o runner (runner.ts) já grava searchDispatched=true
		// JUNTO com revealCompleted, só quando artifacts REAIS aparecem. Marcar
		// antes travava uma busca que falhasse (teto agregado do FIX-291a
		// estourado, erro duro etc.) em searchDispatched=true PRA SEMPRE: o guard
		// "search-already-dispatched" (acima) nunca mais deixava retentar a busca
		// num turno seguinte, mesmo sem jamais ter mostrado dado real.
		const postReveal = await reloadMeta(conversationId);
		if (!postReveal.revealCompleted) {
			console.log(
				`[discovery-degraded] guard: busca falhou/degradou — searchDispatched NAO marcado, retry liberado num turno seguinte (conv=${conversationId})`,
			);
			return;
		}
		// FIX-303: o opt-in de WhatsApp NÃO dispara mais aqui (pós-reveal) — só no
		// FECHO, ver bloco logo antes de `nextGateToFire === "search"` acima.
		return;
	}

	// BUG-REVEAL-LOOP: pós-reveal, quando o usuário sinaliza avanço, o sistema
	// dirige o card de decisão ("Esse plano faz sentido?") UMA vez — fim do passo
	// 4 da jornada → abre o passo 5 (contratar). Espelha o search reveal acima:
	// directive determinístico + guard de idempotência (decisionDispatched). Sem
	// isso o agent re-disparava o reveal em loop e nunca cruzava pra plataforma nova.
	// FIX-331: extraído em função própria — ver `dispatchDecisionCascade` acima,
	// chamada tanto daqui (pós-modelo) quanto do intercepto PRÉ-modelo mais acima
	// nesta função.
	if (result.nextGateToFire === "decision") {
		yield* dispatchDecisionCascade({ conversationId, channel, currentPersona, knownName });
		return;
	}

	if (result.nextGateToFire) {
		// FIX-233 (handoff agente-vendas-consorcio, 2026-07-09): gate `desire` é
		// NÃO bloqueante — marcado na EMISSÃO (mesmo padrão de consentOffered/
		// simulatorOfferDispatched), nunca na resposta. Pulou ou não, o funil
		// nunca mais re-emite este gate.
		if (result.nextGateToFire === "desire") {
			const refreshed = await reloadMeta(conversationId);
			if (!refreshed.desireAsked) {
				await persistMeta(conversationId, { ...refreshed, desireAsked: true });
			}
		}
		// docx passo 4: a oferta do simulador acontece UMA vez (padrão consent).
		// Marcado na emissão. FIX-260: um afirmativo digitado no turno seguinte
		// é interceptado MAIS ACIMA (antes deste bloco rodar) e dispara o
		// directive do dial — só chega aqui negativo/ambíguo, que avança pro
		// decision (comportamento correto, intacto).
		if (result.nextGateToFire === "simulator-offer") {
			const refreshed = await reloadMeta(conversationId);
			if (!refreshed.simulatorOfferDispatched) {
				await persistMeta(conversationId, { ...refreshed, simulatorOfferDispatched: true });
			}
		}
		// FIX-297: "Posso te mostrar a opção que eu recomendo?" acontece UMA vez
		// (padrão simulator-offer) — `recoConsentDispatched` só marca que a
		// PERGUNTA já saiu, idempotente (só grava na 1ª vez). Um afirmativo
		// digitado é interceptado MAIS ACIMA (antes deste bloco rodar) e libera o
		// hero pendente, marcando `recoConsentAnswered`.
		//
		// FIX-308 (rodada 10, onda 4): ao contrário do simulator-offer, aqui
		// negativo/ambíguo NÃO avança a cascata — `nextGate()` (qualify-state.ts)
		// está acoplado a `recoConsentAnswered`, não a este flag: enquanto a
		// resposta não é reconhecida como consentimento, `nextGateToFire` volta a
		// ser "reco-consent" turno após turno (mesmo padrão dos gates de coleta),
		// e este bloco só re-executa o no-op abaixo (já dispatched, nada a
		// gravar de novo).
		if (result.nextGateToFire === "reco-consent") {
			const refreshed = await reloadMeta(conversationId);
			if (!refreshed.recoConsentDispatched) {
				await persistMeta(conversationId, { ...refreshed, recoConsentDispatched: true });
			}
		}
		// FIX-253 (rodada 4, veredito Fable FINAL §2/§3, "pro teto" #2): o
		// caminho de TEXTO LIVRE do gate lance ("não tenho o valor... mas junto 4
		// mil/mês") despachava a pergunta de lance-embutido SEM o card
		// embedded_bid — só o clique (route.ts) emitia. `suppressGateEvent`
		// (FIX-254) protege o caminho de CLIQUE de double-dispatch: quando o
		// chamador (route.ts) já vai emitir o card+pergunta explicitamente
		// depois deste turno de directive, este bloco fica inteiramente calado.
		if (!suppressGateEvent) {
			if (result.nextGateToFire === "lance-embutido") {
				const refreshed = await reloadMeta(conversationId);
				yield* emitServerCard({
					conversationId,
					channel,
					persona: currentPersona,
					artifactType: "embedded_bid",
					payload: buildEmbeddedBidCard(refreshed).payload,
				});
			}
			yield {
				type: "gate",
				gate: result.nextGateToFire,
				prefix: result.prefixForNextGate ?? undefined,
				modelAsked: result.modelAskedGateQuestion === true,
			};
		}
	}

	// FIX-207 (watchdog): marca/limpa o gate pendente do funil. Se este turno de
	// USUÁRIO terminou com um gate real suprimido (nenhum card disparado), grava
	// pendingGateSince — o worker gate-reengage-poll reabre o funil se o usuário
	// sumir (a cauda não-determinística que o FIX-206 não cobre). Qualquer avanço
	// (gate disparado, turno server-authored, estado terminal) LIMPA o marcador.
	// Governança determinística em código (Lei 4), não regra-no-prompt.
	{
		const watchMeta = await reloadMeta(conversationId);
		const pendingGate = pendingGateAfterTurn({
			meta: watchMeta,
			gateFired: Boolean(result.nextGateToFire),
			isUserTurn,
			hasContactName: Boolean(knownName),
		});
		if (pendingGate) {
			// Reseta o relógio de inatividade a cada turno de usuário que deixa o
			// funil pendente (só turno de usuário chega aqui — server retorna null).
			await persistMeta(conversationId, {
				...watchMeta,
				pendingGateSince: simulatorNow().getTime(),
				pendingGate,
			});
		} else if (watchMeta.pendingGateSince !== undefined) {
			const cleared = { ...watchMeta };
			delete cleared.pendingGateSince;
			delete cleared.pendingGate;
			await persistMeta(conversationId, cleared);
		}
	}

	yield { type: "finish", reason: "ok" };
}

async function* runTransitionAndContinue(args: {
	conversationId: string;
	fromPersona: Persona;
	toCategory: Parameters<typeof planTransition>[0]["toCategory"];
	expertiseHint?: string | null;
	channel: TurnInput["channel"];
	contactName: string | null;
}): AsyncGenerator<TurnEvent> {
	const { conversationId, fromPersona, toCategory, expertiseHint, channel, contactName } = args;
	const plan = await planTransition({ conversationId, fromPersona, toCategory, expertiseHint });
	if (plan.kind === "abort") {
		yield* yieldTransitionAbort(plan.apologyText);
		return;
	}
	yield {
		type: "transition",
		fromPersona: plan.fromPersona,
		toPersona: plan.toPersona,
		toPersonaName: plan.toPersonaName,
		toCategory: plan.toCategory,
		bridgeText: plan.bridgeText,
	};
	yield* runTurn({
		channel,
		conversationId,
		userText: plan.directive,
		isUserTurn: false,
		contactName,
		skipAnalyzer: true,
		skipLeadCollection: true,
	});
}

export async function runTurnFromText(args: {
	channel: TurnInput["channel"];
	from?: string;
	conversationId?: string;
	userText: string;
	isUserTurn: boolean;
	contactName?: string | null;
	skipAnalyzer?: boolean;
	skipLeadCollection?: boolean;
}): Promise<TurnInput> {
	const { from, conversationId, channel, ...rest } = args;
	if (conversationId) {
		return { ...rest, conversationId, channel };
	}
	if (channel === "whatsapp" && from) {
		const { id } = await getOrCreateConversation(from);
		return { ...rest, conversationId: id, channel };
	}
	throw new Error("[orchestrator] either conversationId or (channel=whatsapp + from) required");
}
