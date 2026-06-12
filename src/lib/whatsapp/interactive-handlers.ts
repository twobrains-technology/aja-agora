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
import { sendTextMessage } from "./api";
import {
	buildCreditReactionDirective,
	buildDetailDirective,
	buildExperienceDoubtsDirective,
	buildExperienceFirstDirective,
	buildExperienceReturningDirective,
	buildGroupSelectedDirective,
	buildLanceReactionDirective,
	buildQualifyStartMoreDirective,
	buildQualifyStartYesDirective,
	buildRangePickerDirective,
	buildSimulateDirective,
	buildTimeframeReactionDirective,
	buildWhatIfDirective,
} from "./directives";
import {
	documentUploadToWhatsApp,
	resolveCreditReply,
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
	runDirectiveWithOrchestrator({ from, conversationId, directive });

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
	if (replyId === "qualify_start_yes" || replyId === "qualify_start_more")
		return handleQualifyStart(ctx);
	if (replyId.startsWith("category_")) return handleCategory(ctx);
	if (replyId.startsWith("experience_")) return handleExperience(ctx);
	if (replyId.startsWith("credit_")) return handleCredit(ctx);
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
		const sentTexts: string[] = [];
		for (const item of closingPresentation(res)) {
			let wa: ReturnType<typeof signatureHandoffToWhatsApp> | null = null;
			if (item.kind === "text") wa = { type: "text", text: item.text };
			else if (item.type === "signature_handoff") wa = signatureHandoffToWhatsApp(item.payload);
			else if (item.type === "document_upload") wa = documentUploadToWhatsApp(item.payload);
			if (wa?.type === "text" && wa.text) {
				await sendTextMessage(from, wa.text);
				sentTexts.push(wa.text);
			}
		}
		await saveMessage(conversationId, "assistant", sentTexts.join("\n\n"), "whatsapp");

		// docx passo 5 (linha 52): resumo da contratação por WhatsApp. Nunca quebra
		// o fechamento — falha vira contractSummaryPending.
		const { sendContractSummary } = await import("@/lib/bevi/contract-summary");
		await sendContractSummary(conversationId).catch(() => {});
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

async function handleQualifyStart(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const meta = await loadMeta(conversationId);
	await recordUserClick(ctx);

	if (!meta.currentCategory) return true;

	if (replyId === "qualify_start_yes") {
		await persistMeta(conversationId, { ...meta, qualifyConsented: true });
		await runAgentDirective(from, conversationId, buildQualifyStartYesDirective());
		return true;
	}

	// pendingFollowUp keeps nextGate at doubts-wait until the user types
	// their question and the AI answers; then the post-AI hook clears it.
	await persistMeta(conversationId, { ...meta, pendingFollowUp: true });
	await runAgentDirective(from, conversationId, buildQualifyStartMoreDirective());
	return true;
}

async function handleCredit(ctx: Ctx): Promise<boolean> {
	const { from, replyId, conversationId } = ctx;
	const resolved = resolveCreditReply(replyId);
	if (!resolved) return true;

	const meta = await loadMeta(conversationId);
	const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
		...(meta.qualifyAnswers ?? {}),
		creditMin: resolved.min,
		creditMax: resolved.max,
	};
	await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
	await recordUserClick(ctx);

	await runAgentDirective(from, conversationId, buildCreditReactionDirective(resolved.title));
	return true;
}

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
	await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
	await recordUserClick(ctx);

	if (!meta.currentCategory) return true;

	// Jornada do doc: quem TEM reserva ("yes") passa pelo gate de lance embutido
	// (educa + opt-in) antes da busca. O directive dispara o gate em seguida.
	if (resolved.value === "yes") {
		await runAgentDirective(from, conversationId, buildLanceReactionDirective(resolved.title));
		return true;
	}
	await runSearchSummaryWithOrchestrator({ from, conversationId });
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
		await runAgentDirective(
			from,
			conversationId,
			buildSimulatorDialDirective({ administradora: meta.recommendedAdministradora }),
		);
		return true;
	}
	if (!updated.decisionDispatched) {
		await persistMeta(conversationId, { ...updated, decisionDispatched: true });
		await runAgentDirective(
			from,
			conversationId,
			buildDecisionPromptDirective({ administradora: meta.recommendedAdministradora }),
		);
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
	await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
	await recordUserClick(ctx);

	if (!meta.currentCategory) return true;

	await runSearchSummaryWithOrchestrator({ from, conversationId });
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
			"Tive um problema ao localizar esse grupo. Pode tentar selecionar outra opcao ou me dizer um valor de credito que voce quer simular?",
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

async function handleInterest(ctx: Ctx): Promise<boolean> {
	const { from, conversationId } = ctx;
	// Conversa já com atendente humano: não dispara o funil — o relay cuida.
	const handoff = await getHandoffState(from);
	if (handoff?.isHandedOff) return false;

	// FIX-WA (Kairo 2026-06-12: "whatsapp precisa ser exatamente igual a web"):
	// "Tenho interesse" pós-reveal é AVANÇO no funil canônico self-service
	// (decisão → contratação), espelhando o handler web (FIX-29/FIX-34). NUNCA
	// handoff pra consultor por sinal de interesse — o handoff humano fica SÓ no
	// pedido explícito (suggest_handoff → handoff_confirm) e nos triggers de
	// erro/valor da persona. O clique segue persistido (recordUserClick, GAP #2).
	const meta = await loadMeta(conversationId);
	await recordUserClick(ctx);
	const { buildAdvanceToContractDirective, buildDecisionPromptDirective } = await import(
		"@/lib/agent/orchestrator/directives"
	);
	if (!meta.decisionDispatched) {
		await persistMeta(conversationId, { ...meta, decisionDispatched: true });
		await runAgentDirective(
			from,
			conversationId,
			buildDecisionPromptDirective({ administradora: meta.recommendedAdministradora }),
		);
		return true;
	}
	// Decisão já apresentada — reafirmar interesse avança pro passo 5.
	await runAgentDirective(
		from,
		conversationId,
		buildAdvanceToContractDirective({ administradora: meta.recommendedAdministradora }),
	);
	return true;
}
