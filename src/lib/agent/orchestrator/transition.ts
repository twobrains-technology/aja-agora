import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getCategoryMeta } from "@/lib/agent/categories";
import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import { pickPersonaForCategory } from "@/lib/agent/personas-repo";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import {
	buildTransitionCrossSpecialistDirective,
	buildTransitionFirstContactDirective,
	buildTransitionReturningDirective,
} from "./directives";
import type { TurnEvent } from "./types";

export function transitionBridgeText(specialist: { name: string; categoryLabel: string }): string {
	return `Te conectando com ${specialist.name}, especialista em ${specialist.categoryLabel}.\nUm momento ⏳`;
}

export type TransitionPlan =
	| { kind: "abort"; apologyText: string }
	| {
			kind: "ok";
			bridgeText: string;
			directive: string;
			fromPersona: Persona;
			toPersona: Persona;
			toPersonaName: string;
			toCategory: Category;
	  };

export async function planTransition(args: {
	conversationId: string;
	fromPersona: Persona;
	toCategory: Category;
	expertiseHint?: string | null;
}): Promise<TransitionPlan> {
	const { conversationId, fromPersona, toCategory, expertiseHint } = args;

	let personaRow: Awaited<ReturnType<typeof pickPersonaForCategory>>;
	try {
		personaRow = await pickPersonaForCategory(toCategory, expertiseHint ?? null);
	} catch (err) {
		console.error(`[orchestrator] No active specialist for category=${toCategory}:`, err);
		return {
			kind: "abort",
			apologyText:
				"Desculpe, estou com um problema momentâneo pra te conectar com o especialista. Pode tentar de novo em alguns instantes?",
		};
	}

	const fromConcierge = fromPersona === "concierge";
	const meta0 = getCategoryMeta(personaRow);

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	const meta = metaOf(conv);
	const seenSet = new Set<Category>(meta.personasSeen ?? []);
	const isReturning = seenSet.has(toCategory);
	seenSet.add(toCategory);

	const updated: ConversationMetadata = {
		...meta,
		previousPersona: fromPersona,
		currentPersona: personaRow.id,
		currentCategory: toCategory,
		personasSeen: Array.from(seenSet),
		qualifyAnswers: fromConcierge ? meta.qualifyAnswers : undefined,
	};
	await persistMeta(conversationId, updated);

	const bridgeText = transitionBridgeText({
		name: personaRow.displayName,
		categoryLabel: meta0.label,
	});

	const offerCalibration = fromConcierge && !isReturning;
	const firstName = conv?.contactName?.trim().split(/\s+/)[0] ?? null;
	const nameHint = firstName
		? `O usuario se chama ${firstName}, voce pode usar o primeiro nome.`
		: "";

	const directive = offerCalibration
		? buildTransitionFirstContactDirective(meta0.label, nameHint)
		: isReturning
			? buildTransitionReturningDirective()
			: buildTransitionCrossSpecialistDirective();

	return {
		kind: "ok",
		bridgeText,
		directive,
		fromPersona,
		toPersona: personaRow.id,
		toPersonaName: personaRow.displayName,
		toCategory,
	};
}

export async function* yieldTransitionAbort(apologyText: string): AsyncGenerator<TurnEvent> {
	yield { type: "text-delta", text: apologyText };
	yield { type: "finish", reason: "transition-error" };
}
