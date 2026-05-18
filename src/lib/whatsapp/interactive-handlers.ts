import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getAdapter } from "@/lib/adapters";
import type { Category, ConversationMetadata, ExperiencePrev, Persona } from "@/lib/agent/personas";
import { ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { saveMessage } from "@/lib/conversation/messages";
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
	buildQualifyStartMoreDirective,
	buildQualifyStartYesDirective,
	buildRangePickerDirective,
	buildSimulateDirective,
	buildTimeframeReactionDirective,
	buildWhatIfDirective,
} from "./directives";
import {
	resolveCreditReply,
	resolveLanceReply,
	resolveRange,
	resolveTimeframeReply,
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
	if (replyId.startsWith("lance_")) return handleLance(ctx);
	if (replyId.startsWith("range_")) return handleRange(ctx);
	if (replyId.startsWith("picker_")) return handlePicker(ctx);
	if (replyId.startsWith("group_")) return handleGroupSelected(ctx);
	if (replyId.startsWith("simulate_")) return handleSimulate(ctx);
	if (replyId.startsWith("whatif_")) return handleWhatIf(ctx);
	if (replyId.startsWith("detail_")) return handleDetail(ctx);
	if (replyId.startsWith("interest_")) return handleInterest(ctx);

	return false;
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
		const details = await getAdapter().getGroupDetails({ groupId });
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
		const details = await getAdapter().getGroupDetails({ groupId });
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
		const details = await getAdapter().getGroupDetails({ groupId });
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
	const { from, contactName } = ctx;
	const handoff = await getHandoffState(from);
	if (!handoff?.conversationId || handoff.isHandedOff) {
		// Sem state de handoff: fall-through pra processTextMessage. O
		// orchestrator salva user msg lá dentro — não chamamos recordUserClick
		// aqui pra evitar dupla persistência.
		return false;
	}
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, handoff.conversationId),
	});
	const storedName = contactName ?? conv?.contactName ?? null;
	// Salva o "Tenho interesse!" ANTES do handoff — fica em ordem cronológica,
	// antes da frase de fechamento do bot (que proxy.ts persiste no fix do
	// gap #3). Antes do refactor, handleInterest era o único handler do
	// arquivo que esquecia esse saveMessage — gap #2 do
	// BUG-LEAD-HISTORY-INCOMPLETE. recordUserClick centraliza isso e evita
	// que esse bug reapareça em handlers futuros.
	await recordUserClick(ctx);
	await startInterestHandoff(from, handoff.conversationId, storedName);
	return true;
}
