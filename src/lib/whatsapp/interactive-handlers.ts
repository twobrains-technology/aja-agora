import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getAdapter } from "@/lib/adapters";
import type { Category, ConversationMetadata, ExperiencePrev, Persona } from "@/lib/agent/personas";
import { ROUTABLE_CATEGORIES } from "@/lib/agent/personas";
import { nextGate } from "@/lib/agent/qualify-state";
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
import { getOrCreateConversation, saveMessage } from "./session";

const runAgentDirective = (from: string, conversationId: string, directive: string) =>
	runDirectiveWithOrchestrator({ from, conversationId, directive });

type Ctx = {
	from: string;
	replyId: string;
	replyTitle: string;
	contactName?: string;
	processTextMessage: (from: string, text: string, contactName?: string) => Promise<void>;
};

/**
 * Dispatches a WhatsApp interactive reply. Returns true if a handler claimed
 * the reply; false if no handler matched (caller falls back to text processing).
 */
export async function dispatchInteractiveReply(ctx: Ctx): Promise<boolean> {
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

async function handleHandoffConfirm({ from, replyTitle, contactName }: Ctx): Promise<boolean> {
	const { id: conversationId } = await getOrCreateConversation(from);
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	await saveMessage(conversationId, "user", replyTitle);
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

async function handleHandoffDecline({ from, replyTitle }: Ctx): Promise<boolean> {
	const { id: conversationId } = await getOrCreateConversation(from);
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	await saveMessage(conversationId, "user", replyTitle);
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

async function handleCategory({ from, replyId }: Ctx): Promise<boolean> {
	const category = replyId.replace("category_", "") as Category;
	if (!(ROUTABLE_CATEGORIES as readonly string[]).includes(category)) return false;

	const { id: conversationId } = await getOrCreateConversation(from);
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const fromPersona: Persona = meta.currentPersona ?? "concierge";
	await runTransitionWithOrchestrator({ from, conversationId, fromPersona, toCategory: category });
	return true;
}

async function handleExperience({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const choice = replyId.replace("experience_", "") as ExperiencePrev;
	if (choice !== "first" && choice !== "returning" && choice !== "doubts") return true;

	const { id: conversationId } = await getOrCreateConversation(from);
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	// Reset doubtsAddressed if user loops back through experience.
	await persistMeta(conversationId, {
		...meta,
		experiencePrev: choice,
		doubtsAddressed: choice === "doubts" ? false : meta.doubtsAddressed,
	});
	await saveMessage(conversationId, "user", replyTitle);

	let directive: string;
	if (choice === "first") directive = buildExperienceFirstDirective(replyTitle);
	else if (choice === "returning") directive = buildExperienceReturningDirective(replyTitle);
	else directive = buildExperienceDoubtsDirective(replyTitle);

	await runDirectiveWithOrchestrator({ from, conversationId, directive });
	return true;
}

async function handleQualifyStart({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const { id: conversationId } = await getOrCreateConversation(from);
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	await saveMessage(conversationId, "user", replyTitle);

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

async function handleCredit({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const resolved = resolveCreditReply(replyId);
	if (!resolved) return true;

	const { id: conversationId } = await getOrCreateConversation(from);
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
		...(meta.qualifyAnswers ?? {}),
		creditMin: resolved.min,
		creditMax: resolved.max,
	};
	await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
	await saveMessage(conversationId, "user", replyTitle);

	await runAgentDirective(from, conversationId, buildCreditReactionDirective(resolved.title));
	return true;
}

async function handleTimeframe({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const resolved = resolveTimeframeReply(replyId);
	if (!resolved) return true;

	const { id: conversationId } = await getOrCreateConversation(from);
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
		...(meta.qualifyAnswers ?? {}),
		prazoMeses: resolved.prazoMeses,
	};
	await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
	await saveMessage(conversationId, "user", replyTitle);

	if (!meta.currentCategory) return true;

	await runAgentDirective(from, conversationId, buildTimeframeReactionDirective(resolved.title));
	return true;
}

async function handleLance({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const resolved = resolveLanceReply(replyId);
	if (!resolved) return true;

	const { id: conversationId } = await getOrCreateConversation(from);
	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const merged: NonNullable<ConversationMetadata["qualifyAnswers"]> = {
		...(meta.qualifyAnswers ?? {}),
		hasLance: resolved.value,
	};
	await persistMeta(conversationId, { ...meta, qualifyAnswers: merged });
	await saveMessage(conversationId, "user", replyTitle);

	if (!meta.currentCategory) return true;

	await runSearchSummaryWithOrchestrator({ from, conversationId });
	return true;
}

async function handleRange({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
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
	const { id: conversationId } = await getOrCreateConversation(from);
	await saveMessage(conversationId, "user", replyTitle);
	await runAgentDirective(
		from,
		conversationId,
		buildRangePickerDirective(label, range.category, filtros, budgetFmt),
	);
	return true;
}

async function handlePicker({
	from,
	replyTitle,
	contactName,
	processTextMessage,
}: Ctx): Promise<boolean> {
	await processTextMessage(from, `Meu orçamento é ${replyTitle}`, contactName);
	return true;
}

async function handleGroupSelected({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const groupId = replyId.replace("group_", "");
	try {
		const details = await getAdapter().getGroupDetails({ groupId });
		const { id: conversationId } = await getOrCreateConversation(from);
		await saveMessage(conversationId, "user", replyTitle);
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

async function handleSimulate({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const groupId = replyId.replace("simulate_", "");
	try {
		const details = await getAdapter().getGroupDetails({ groupId });
		const { id: conversationId } = await getOrCreateConversation(from);
		await saveMessage(conversationId, "user", replyTitle);
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

async function handleWhatIf({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const groupId = replyId.replace("whatif_", "");
	try {
		const details = await getAdapter().getGroupDetails({ groupId });
		const { id: conversationId } = await getOrCreateConversation(from);
		await saveMessage(conversationId, "user", replyTitle);
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

async function handleDetail({ from, replyId, replyTitle }: Ctx): Promise<boolean> {
	const groupId = replyId.replace("detail_", "");
	const { id: conversationId } = await getOrCreateConversation(from);
	await saveMessage(conversationId, "user", replyTitle);
	await runAgentDirective(from, conversationId, buildDetailDirective(groupId));
	return true;
}

async function handleInterest({ from, contactName }: Ctx): Promise<boolean> {
	const handoff = await getHandoffState(from);
	if (handoff?.conversationId && !handoff.isHandedOff) {
		const conv = await db.query.conversations.findFirst({
			where: eq(conversations.id, handoff.conversationId),
		});
		const storedName = contactName ?? conv?.contactName ?? null;
		const handled = await startInterestHandoff(from, handoff.conversationId, storedName);
		if (handled) return true;
	}
	// Fall through — caller will do processTextMessage(replyTitle).
	return false;
}
