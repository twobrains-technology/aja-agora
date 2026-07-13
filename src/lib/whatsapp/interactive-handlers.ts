import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getDiscoveryAdapter } from "@/lib/adapters";
import type { Category, ConversationMetadata, ExperiencePrev, Persona } from "@/lib/agent/personas";
import { ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import { LANCE_EMBUTIDO_DEFAULT_PERCENT, objetivoForPrazo } from "@/lib/agent/qualify-config";
import { nextGate } from "@/lib/agent/qualify-state";
import { confirmOffer } from "@/lib/bevi/fulfillment";
import { saveMessage } from "@/lib/conversation/messages";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import {
	fireGate,
	runDirectiveWithOrchestrator,
	runSearchSummaryWithOrchestrator,
	runTransitionWithOrchestrator,
} from "./adapter";
import { sendInteractiveMessage, sendTextMessage } from "./api";
import {
	buildDetailDirective,
	buildExperienceDoubtsDirective,
	buildExperienceFirstDirective,
	buildExperienceReturningDirective,
	buildGroupSelectedDirective,
	buildLanceReactionDirective,
	buildRangePickerDirective,
	buildSimulateDirective,
	buildTimeframeReactionDirective,
	buildWhatIfDirective,
} from "./directives";
import {
	artifactToWhatsApp,
	documentUploadToWhatsApp,
	resolveLanceEmbutidoReply,
	resolveLanceReply,
	resolveLanceValueReply,
	resolveRange,
	resolveSimulatorOfferReply,
	resolveTimeframeReply,
	signatureHandoffToWhatsApp,
} from "./formatter";
import { getHandoffState, startInterestHandoff } from "./proxy";
import { getOrCreateConversation } from "./session";

const runAgentDirective = (from: string, conversationId: string, directive: string) =>
	// Clique de botão NUNCA pode fechar mudo (bug consent→identify 2026-07-02, "Bora!"
	// sem resposta): liga o guard de turno-mudo — se o directive não emitir nada, o
	// consumeEvents re-pergunta o gate pendente em vez do silêncio.
	runDirectiveWithOrchestrator({ from, conversationId, directive, guardEmptyTurn: true });

type DispatchInput = {
	from: string;
	replyId: string;
	replyTitle: string;
	contactName?: string;
	processTextMessage: (from: string, text: string, contactName?: string) => Promise<void>;
};

// Ctx interno enriquecido: conversationId já resolvido + flag mutável p/
// garantir que recordUserClick é idempotente dentro de um único dispatch.
type Ctx = DispatchInput & {
	conversationId: string;
	userMessageGuard: { recorded: boolean };
};

/**
 * Persiste a mensagem do usuário equivalente ao clique do botão. Idempotente
 * por dispatch — se chamado duas vezes (handler + helper, p.ex.), só persiste
 * uma. `override` permite enriquecer o texto salvo (ex: handlePicker que vira
 * "Meu orçamento é X").
 *
 * Centraliza o que antes vivia espalhado em ~12 handlers, cada um chamando
 * `saveMessage(conversationId, "user", replyTitle)`. A descentralização era
 * a causa de gaps no histórico — bastava um handler novo esquecer (foi o
 * caso de handleInterest no BUG-LEAD-HISTORY-INCOMPLETE).
 */
async function recordUserClick(ctx: Ctx, override?: string): Promise<void> {
	if (ctx.userMessageGuard.recorded) return;
	await saveMessage(ctx.conversationId, "user", override ?? ctx.replyTitle, "whatsapp");
	ctx.userMessageGuard.recorded = true;
}

/**
 * Dispatches a WhatsApp interactive reply. Returns true if a handler claimed
 * the reply; false if no handler matched (caller falls back to text processing).
 *
 * Conversa é resolvida UMA vez aqui — handlers consomem `ctx.conversationId`
 * sem chamar `getOrCreateConversation` cada um.
 */
export async function dispatchInteractiveReply(input: DispatchInput): Promise<boolean> {
	const { id: conversationId } = await getOrCreateConversation(input.from);
	const ctx: Ctx = {
		...input,
		conversationId,
		userMessageGuard: { recorded: false },
	};
	const { replyId } = ctx;

	if (replyId === "handoff_confirm") return handleHandoffConfirm(ctx);
	if (replyId === "handoff_decline") return handleHandoffDecline(ctx);
	if (replyId.startsWith("category_")) return handleCategory(ctx);
	if (replyId.startsWith("experience_")) return handleExperience(ctx);
	if (replyId.startsWith("timeframe_")) return handleTimeframe(ctx);
	if (replyId.startsWith("lanceembutido_")) return handleLanceEmbutido(ctx);
	if (replyId.startsWith("lancevalue_")) return handleLanceValue(ctx);
	if (replyId.startsWith("lance_")) return handleLance(ctx);
	if (replyId.startsWith("simoffer_")) return handleSimulatorOffer(ctx);
	if (replyId.startsWith("range_")) return handleRange(ctx);
	if (replyId.startsWith("picker_")) return handlePicker(ctx);
	if (replyId.startsWith("group_")) return handleGroupSelected(ctx);
	if (replyId.startsWith("simulate_")) return handleSimulate(ctx);
	if (replyId.startsWith("whatif_")) return handleWhatIf(ctx);
	if (replyId.startsWith("detail_")) return handleDetail(ctx);
	if (replyId === "show_others") return handleShowOthers(ctx);
	if (replyId === "decision_outras") return handleDecisionOutras(ctx);
	if (replyId.startsWith("interest_")) return handleInterest(ctx);
	if (replyId === "contract_confirm") return handleContractConfirm(ctx);
	if (replyId === "contract_cancel") return handleContractCancel(ctx);
	if (replyId === "offer_confirm") return handleOfferConfirm(ctx);
	if (replyId === "offer_reject") return handleOfferReject(ctx);

	return false;
}

// ── Passo 5 "Contratar" (FIX-25) — botões do contract_form (fechamento Bevi) ──
async function handleContractConfirm(ctx: Ctx): Promise<boolean> {
	await recordUserClick(ctx);
	const { fireContract } = await import("./contract-capture");
	await fireContract(ctx.from, ctx.conversationId);
	return true;
}

async function handleContractCancel(ctx: Ctx): Promise<boolean> {
	await recordUserClick(ctx);
	const meta = await loadMeta(ctx.conversationId);
	const cleared = { ...meta };
	delete cleared.contractCollection;
	await persistMeta(ctx.conversationId, cleared);
	const { CONTRACT_CANCELLED_REPLY } = await import("./contract-capture");
	await sendTextMessage(ctx.from, CONTRACT_CANCELLED_REPLY);
	await ctx.processTextMessage(ctx.from, "Quero ver outras opções", ctx.contactName);
	return true;
}

// ── Passo 5 "Contratar" (fechamento Bevi) — botões do real_offer ──
// Terminal idêntico ao web (route.ts offer-confirm, FIX-25): confirmOffer →
// contractClosed=true → reforço literal + assinatura + documentos + "Parabéns!"
// (closing-presentation.ts, copy única produção+eval) → resumo por WhatsApp.
async function handleOfferConfirm(ctx: Ctx): Promise<boolean> {
	await recordUserClick(ctx);
	const { from, conversationId } = ctx;
	try {
		const res = await confirmOffer(conversationId);
		// Estado TERMINAL: pós-confirmação o agente não re-apresenta contract_form.
		const meta = await loadMeta(conversationId);
		await persistMeta(conversationId, { ...meta, contractClosed: true });

		const { closingPresentation } = await import("@/lib/bevi/closing-presentation");
		// FIX-203: cada mensagem da confirmação passa por resolveAndSend com sua chave
		// lógica. Janela ABERTA → cada `freeTextFallback` roda e manda a copy atual, na
		// MESMA ordem (comportamento idêntico ao de hoje). Janela FECHADA → sai como
		// template Meta (confirmacao_contratacao / proposta_pronta) OU enfileira até
		// aprovar. `templatedKeys` evita reenviar o mesmo template por chave (os vários
		// textos de `confirmacao_contratacao` viram UM template fora da janela).
		const { resolveAndSend } = await import("./template-dispatch");
		const admin = res.administradora ?? "";
		const sentTexts: string[] = [];
		const templatedKeys = new Set<string>();
		for (const item of closingPresentation(res)) {
			let wa: ReturnType<typeof signatureHandoffToWhatsApp> | null = null;
			let usageKey = "confirmacao_contratacao";
			if (item.kind === "text") wa = { type: "text", text: item.text };
			else if (item.type === "signature_handoff") {
				wa = signatureHandoffToWhatsApp(item.payload);
				usageKey = "proposta_pronta";
			} else if (item.type === "document_upload") wa = documentUploadToWhatsApp(item.payload);
			if (wa?.type === "text" && wa.text) {
				if (templatedKeys.has(usageKey)) continue;
				const text = wa.text;
				const link = (item.kind === "artifact" && (item.payload.consortiumProposalLink as string)) || "";
				const result = await resolveAndSend({
					to: from,
					conversationId,
					usageKey,
					params: { body: usageKey === "proposta_pronta" ? [admin, link] : [admin] },
					freeTextFallback: async () => {
						await sendTextMessage(from, text);
						sentTexts.push(text);
					},
				});
				if (result.channel !== "free_text") templatedKeys.add(usageKey);
			}
		}
		if (sentTexts.length > 0) {
			await saveMessage(conversationId, "assistant", sentTexts.join("\n\n"), "whatsapp");
		}

		// docx passo 5 (linha 52): resumo da contratação por WhatsApp. Nunca quebra
		// o fechamento — falha vira contractSummaryPending.
		const { sendContractSummary } = await import("@/lib/bevi/contract-summary");
		await sendContractSummary(conversationId).catch(() => {});
		// FIX-235 (D8): fecho — pede o "oi" (abre a janela de 24h) e aciona a mesa
		// (especialista em cadastros) NA HORA. Best-effort, nunca quebra o fechamento.
		const { sendFechoPedirOi } = await import("@/lib/bevi/fecho-pedir-oi");
		await sendFechoPedirOi(conversationId).catch(() => {});
	} catch {
		await sendTextMessage(
			from,
			"Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?",
		);
	}
	return true;
}

async function handleOfferReject(ctx: Ctx): Promise<boolean> {
	await recordUserClick(ctx);
	// "ver outras opções" — deixa o agente conduzir pelo fluxo de texto.
	await ctx.processTextMessage(ctx.from, "Quero ver outras opções", ctx.contactName);
	return true;
}

// ---- Handlers ----

async function loadMeta(conversationId: string): Promise<ConversationMetadata> {
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	return metaOf(conv);
}

async function handleHandoffConfirm(ctx: Ctx): Promise<boolean> {
	const { from, contactName, conversationId } = ctx;
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	await recordUserClick(ctx);
	// Clear the lock either way — handoff queue takes over.
	await persistMeta(conversationId, {
		...meta,
		handoffSuggested: false,
		handoffReason: undefined,
	});
	const storedName = contactName ?? conv?.contactName ?? null;
	await startInterestHandoff(from, conversationId, storedName);
	return true;
}

async function handleHandoffDecline(ctx: Ctx): Promise<boolean> {
	const { from, conversationId } = ctx;
	const meta = await loadMeta(conversationId);
	await recordUserClick(ctx);
	const cleared: ConversationMetadata = {
		...meta,
		handoffSuggested: false,
		handoffReason: undefined,
	};
	await persistMeta(conversationId, cleared);
	// Resume the funnel — fire the next gate that was pending when handoff fired.
	const gate = nextGate(cleared);
	if (gate === "search") {
		await runSearchSummaryWithOrchestrator({ from, conversationId });
	} else if (gate !== "doubts-wait") {
		await fireGate(from, conversationId, gate, cleared);
	} else {
		await sendTextMessage(from, "Beleza, vamos seguir então. O que você quer saber?");
	}
	return true;
}

async function handleCategory(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const category = replyId.replace("category_", "") as Category;
	if (!(ROUTABLE_CATEGORIES as readonly string[]).includes(category)) return false;

	const meta = await loadMeta(conversationId);
	const fromPersona: Persona = meta.currentPersona ?? "concierge";
	await recordUserClick(ctx);
	await runTransitionWithOrchestrator({ from, conversationId, fromPersona, toCategory: category });
	return true;
}

async function handleExperience(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const choice = replyId.replace("experience_", "") as ExperiencePrev;
	if (choice !== "first" && choice !== "returning" && choice !== "doubts") return true;

	const meta = await loadMeta(conversationId);
	// Reset doubtsAddressed if user loops back through experience.
	await persistMeta(conversationId, {
		...meta,
		experiencePrev: choice,
		doubtsAddressed: choice === "doubts" ? false : meta.doubtsAddressed,
	});
	await recordUserClick(ctx);

	let directive: string;
	if (choice === "first") directive = buildExperienceFirstDirective(ctx.replyTitle);
	else if (choice === "returning") directive = buildExperienceReturningDirective(ctx.replyTitle);
	else directive = buildExperienceDoubtsDirective(ctx.replyTitle);

	await runDirectiveWithOrchestrator({ from, conversationId, directive });
	return true;
}

// FIX-120 (paridade FIX-115): o gate credit no WhatsApp virou CONVERSA — não há
// mais lista de faixas, logo nenhum reply `credit_*` chega. `handleCredit` (que
// resolvia a faixa e gravava range.max) foi aposentado; o valor é dito por texto
// livre e capturado pelo analyzer + backstop parseAssetValue (orchestrator).

async function handleTimeframe(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const resolved = resolveTimeframeReply(replyId);
	if (!resolved) return true;

	const meta = await loadMeta(conversationId);
	const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
		...(meta.qualifyAnswers ?? {}),
		prazoMeses: resolved.prazoMeses,
		objetivo: objetivoForPrazo(resolved.prazoMeses),
	};
	await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
	await recordUserClick(ctx);

	if (!meta.currentCategory) return true;

	await runAgentDirective(from, conversationId, buildTimeframeReactionDirective(resolved.title));
	return true;
}

async function handleLance(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const resolved = resolveLanceReply(replyId);
	if (!resolved) return true;

	const meta = await loadMeta(conversationId);
	const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
		...(meta.qualifyAnswers ?? {}),
		hasLance: resolved.value,
	};
	const updated = { ...meta, qualifyAnswers: merged };
	await persistMeta(conversationId, updated);
	await recordUserClick(ctx);

	if (!meta.currentCategory) return true;

	// Jornada do doc (Passo 2, FIX-4): a educação de lance embutido vale pra
	// QUALQUER resposta (Sim/Não/Talvez) — o próprio texto mira quem NÃO tem o
	// valor do lance hoje. "yes" reage primeiro (buildLanceReactionDirective →
	// gate lance-value → lance-embutido). FIX-118 (paridade FIX-92, route.ts:917-928):
	// "no"/"maybe" vão direto pro gate `lance-embutido` (educa + opt-in) ANTES da
	// busca. Antes caíam em runSearchSummaryWithOrchestrator, pulando a educação
	// (regressão do FIX-4 que o FIX-92 corrigiu só no web). A busca só roda depois
	// do clique em lanceembutido_* (handleLanceEmbutido → runSearchSummary...).
	if (resolved.value === "yes") {
		await runAgentDirective(from, conversationId, buildLanceReactionDirective(resolved.title));
		return true;
	}
	await fireGate(from, conversationId, "lance-embutido", updated);
	return true;
}

// docx passo 4: resposta à oferta do simulador (conceito do Bernardo).
// "yes" → directive do dial; "no" → card de decisão direto.
async function handleSimulatorOffer(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const resolved = resolveSimulatorOfferReply(replyId);
	if (!resolved) return true;

	const meta = await loadMeta(conversationId);
	const updated = { ...meta, simulatorOfferDispatched: true };
	await persistMeta(conversationId, updated);
	await recordUserClick(ctx);

	const { buildDecisionPromptDirective, buildSimulatorDialDirective } = await import(
		"@/lib/agent/orchestrator/directives"
	);
	if (resolved.value === "yes") {
		// FIX-241 (âncora de dinheiro): mesma narração da web — "cálculo único,
		// duas apresentações" (spec 03).
		const { computeMoneyAnchor } = await import("@/lib/agent/orchestrator/dial-payload");
		const moneyAnchor =
			computeMoneyAnchor(meta.recommendedOffer, {
				monthlySavings: meta.qualifyAnswers?.monthlySavings,
				lanceValue: meta.qualifyAnswers?.lanceValue,
				fgtsValue: meta.qualifyAnswers?.fgtsValue,
			}) ?? undefined;
		await runAgentDirective(
			from,
			conversationId,
			buildSimulatorDialDirective({ administradora: meta.recommendedAdministradora, moneyAnchor }),
		);
		return true;
	}
	if (!updated.decisionDispatched) {
		await persistMeta(conversationId, { ...updated, decisionDispatched: true });
		// FIX-253 (rodada 4, veredito Fable FINAL §3): o directive SÓ narra — o
		// card de decisão é emissão SERVER-SIDE determinística (nunca mais
		// tool-call do LLM, present_decision_prompt saiu do toolset em
		// tool-policy.ts). Emite explícito aqui — mesma paridade do web
		// (route.ts, ramo simulator-offer).
		await runAgentDirective(from, conversationId, buildDecisionPromptDirective());
		const { buildDecisionPromptCard } = await import("@/lib/agent/orchestrator/server-cards");
		const wa = artifactToWhatsApp("decision_prompt", buildDecisionPromptCard(updated).payload);
		if (wa?.type === "interactive" && wa.interactive) {
			await sendInteractiveMessage(from, wa.interactive);
		}
	}
	return true;
}

// docx passo 2 (linha 21-22): "Qual valor aproximado?" — o valor do lance vem
// do USUÁRIO, nunca derivado silencioso. Persiste e dispara o lance-embutido.
async function handleLanceValue(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const resolved = resolveLanceValueReply(replyId);
	if (!resolved) return true;

	const meta = await loadMeta(conversationId);
	const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
		...(meta.qualifyAnswers ?? {}),
		lanceValue: resolved.value,
	};
	const updated = { ...meta, qualifyAnswers: merged };
	await persistMeta(conversationId, updated);
	await recordUserClick(ctx);
	await fireGate(from, conversationId, "lance-embutido", updated);
	return true;
}

async function handleLanceEmbutido(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const resolved = resolveLanceEmbutidoReply(replyId);
	if (!resolved) return true;

	const considera = resolved.value === "yes";
	const meta = await loadMeta(conversationId);
	const q = meta.qualifyAnswers ?? {};
	const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
		...q,
		lanceEmbutido: considera,
		lanceEmbutidoPercent: considera ? LANCE_EMBUTIDO_DEFAULT_PERCENT : undefined,
		// lanceValue veio do gate lance-value (resposta do usuário, docx).
		lanceValue: q.lanceValue,
	};
	const updated = { ...meta, qualifyAnswers: merged };
	await persistMeta(conversationId, updated);
	await recordUserClick(ctx);

	if (!meta.currentCategory) return true;

	// FIX-215 (Ata 2026-07-04): lance agora é PÓS-reveal — a busca JÁ ocorreu
	// (é o pré-requisito pra este gate existir, ver qualify-state.ts). Despacha
	// o próximo passo REAL (simulator-offer/decision), nunca re-dispara a busca.
	const gate = nextGate(updated);
	if (gate === "search") {
		await runSearchSummaryWithOrchestrator({ from, conversationId });
	} else if (gate === "simulator-offer") {
		// Idempotência (FIX-215): despachando o simulator-offer por AQUI (e não via
		// index.ts), marca o dispatch — senão, se o usuário responder o card por
		// TEXTO, nextGate recomputaria simulator-offer com a flag ainda false e o
		// card sairia 2× (o "sim" do usuário não seria honrado).
		const dispatched = { ...updated, simulatorOfferDispatched: true };
		await persistMeta(conversationId, dispatched);
		await fireGate(from, conversationId, gate, dispatched);
	} else {
		await fireGate(from, conversationId, gate, updated);
	}
	return true;
}

async function handleRange(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const range = resolveRange(replyId);
	if (!range) return false;

	const catLabel: Record<string, string> = {
		auto: "carro",
		imovel: "imóvel",
		moto: "moto",
		servicos: "serviço",
	};
	const label = catLabel[range.category] ?? "consórcio";
	const budgetFmt = range.budget.toLocaleString("pt-BR");
	const filtros =
		range.creditMin > 0
			? `creditMin=${range.creditMin}, creditMax=${range.creditMax}`
			: `creditMax=${range.creditMax}`;
	await recordUserClick(ctx);
	await runAgentDirective(
		from,
		conversationId,
		buildRangePickerDirective(label, range.category, filtros, budgetFmt),
	);
	return true;
}

async function handlePicker(ctx: Ctx): Promise<boolean> {
	const { from, replyTitle, conversationId } = ctx;
	// Pass enriquecido vai pro agent; persistimos a mesma string no histórico
	// pra manter coerência entre o que o agent recebe e o que o admin vê.
	const enriched = `Meu orçamento é ${replyTitle}`;
	await recordUserClick(ctx, enriched);
	await runAgentDirective(from, conversationId, enriched);
	// Não delega mais pra processTextMessage — antes delegava e processTextMessage
	// salvava a user msg pelo orchestrator. Refactor centraliza no dispatcher,
	// então persistimos aqui e disparamos o agent direto. Comportamento
	// equivalente do ponto de vista do agente (mesmo userText).
	return true;
}

async function handleGroupSelected(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const groupId = replyId.replace("group_", "");
	try {
		const details = await getDiscoveryAdapter(conversationId).getGroupDetails({ groupId });
		await recordUserClick(ctx);
		await runAgentDirective(
			from,
			conversationId,
			buildGroupSelectedDirective(
				details.administradora,
				groupId,
				details.creditValue,
				details.termMonths,
			),
		);
	} catch (err) {
		console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
		await sendTextMessage(
			from,
			"Tive um problema ao localizar esse grupo. Pode tentar selecionar outra opção ou me dizer um valor de crédito que você quer simular?",
		);
	}
	return true;
}

async function handleSimulate(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const groupId = replyId.replace("simulate_", "");
	try {
		const details = await getDiscoveryAdapter(conversationId).getGroupDetails({ groupId });
		await recordUserClick(ctx);
		await runAgentDirective(
			from,
			conversationId,
			buildSimulateDirective(details.administradora, groupId, details.creditValue),
		);
	} catch (err) {
		console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
		await sendTextMessage(from, "Tive um problema ao localizar esse grupo. Pode tentar de novo?");
	}
	return true;
}

async function handleWhatIf(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const groupId = replyId.replace("whatif_", "");
	try {
		const details = await getDiscoveryAdapter(conversationId).getGroupDetails({ groupId });
		await recordUserClick(ctx);
		await runAgentDirective(
			from,
			conversationId,
			buildWhatIfDirective(details.administradora, details.creditValue),
		);
	} catch (err) {
		console.error(`[whatsapp-processor] Failed to load group ${groupId}:`, err);
		await sendTextMessage(from, "Tive um problema ao localizar esse grupo. Pode tentar de novo?");
	}
	return true;
}

async function handleDetail(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const groupId = replyId.replace("detail_", "");
	await recordUserClick(ctx);
	await runAgentDirective(from, conversationId, buildDetailDirective(groupId));
	return true;
}

// FIX-108: "Ver outras opções" do card da recomendada. A recomendada é o
// destaque; este botão abre as alternativas (a comparação). Pede ao agente as
// outras opções pelo texto canônico — o MESMO caminho provado de offer_reject/
// contract_cancel (o agente re-apresenta o comparison_table com os grupos REAIS
// que já estão no contexto da conversa, sem fabricar ids).
// TODO(bloco-jornada-entrada): o reveal deve apresentar a recomendada PRIMEIRO e
// segurar o comparison_table até este clique (hoje o reveal ainda emite a
// comparação no mesmo turno — quando o contrato do reveal mudar, esta passa a
// ser a ÚNICA via de abrir as alternativas).
async function handleShowOthers(ctx: Ctx): Promise<boolean> {
	await recordUserClick(ctx);
	await ctx.processTextMessage(ctx.from, "Quero ver outras opções", ctx.contactName);
	return true;
}

// FIX-119 (D22): "Ver outras opções" do CARD DE DECISÃO (decision_outras). O
// comparativo é DETERMINÍSTICO — surfaça as outras ofertas REAIS da descoberta
// (buildOtherOptions: cache do adapter, dedupe, exclui a recomendada), ESPELHANDO
// o web (route.ts:521-548). Zero free-run do modelo, zero dado inventado
// (docstring de other-options.ts). NÃO confundir com handleShowOthers (card da
// recomendada, FIX-108) que delega ao modelo — a D22 é sobre o card de decisão e
// exige o caminho model-free pra não arriscar fabricar/omitir números.
async function handleDecisionOutras(ctx: Ctx): Promise<boolean> {
	const { from, conversationId } = ctx;
	await recordUserClick(ctx);
	try {
		const meta = await loadMeta(conversationId);
		const { buildOtherOptions } = await import("@/lib/bevi/other-options");
		const others = await buildOtherOptions(conversationId, meta);
		await sendTextMessage(from, others.text);
		await saveMessage(conversationId, "assistant", others.text, "whatsapp");
		const wa = artifactToWhatsApp("comparison_table", { groups: others.groups });
		if (wa?.type === "interactive" && wa.interactive) {
			await sendInteractiveMessage(from, wa.interactive);
		} else if (wa?.type === "text" && wa.text) {
			await sendTextMessage(from, wa.text);
		}
	} catch {
		// Espelha o fallback do web (route.ts:539-546): nunca deixa o clique em
		// silêncio nem cai no modelo.
		await sendTextMessage(
			from,
			"Deixa eu refazer a busca pra te mostrar as outras opções — me dá um instante e pede de novo?",
		);
	}
	return true;
}

async function handleInterest(ctx: Ctx): Promise<boolean> {
	const { from, conversationId } = ctx;
	// Conversa já com atendente humano: não dispara o funil — o relay cuida.
	const handoff = await getHandoffState(from);
	if (handoff?.isHandedOff) return false;

	// FIX-117 (paridade FIX-38, route.ts:485-499 — "whatsapp precisa ser
	// exatamente igual a web"): "Tenho interesse" pós-reveal é AVANÇO DIRETO ao
	// passo 5 (present_contract_form). O clique JÁ é a decisão — sem intercalar o
	// card "Esse plano faz sentido?" (dupla confirmação que o FIX-38 removeu no
	// web: "ta pedindo confirmacao demais"). Marca decisionDispatched ANTES de
	// dirigir o avanço: a tool-policy só libera present_contract_form na fase
	// "closing" (decisionDispatched===true) — sem a marca o avanço cairia na fase
	// "reveal" e a tool seria filtrada. NUNCA handoff pra consultor por sinal de
	// interesse — o handoff humano fica SÓ no pedido explícito. O card de decisão
	// fica pros caminhos AMBÍGUOS (handleSimulatorOffer "Agora não"), intocado
	// aqui. O clique segue persistido (recordUserClick).
	const meta = await loadMeta(conversationId);
	await recordUserClick(ctx);
	if (!meta.decisionDispatched) {
		await persistMeta(conversationId, { ...meta, decisionDispatched: true });
	}
	const { buildAdvanceToContractDirective } = await import("@/lib/agent/orchestrator/directives");
	await runAgentDirective(
		from,
		conversationId,
		buildAdvanceToContractDirective({ administradora: meta.recommendedAdministradora }),
	);
	return true;
}
