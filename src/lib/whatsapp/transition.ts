import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getCategoryMeta } from "@/lib/agent/categories";
import type { Category, ConversationMetadata, Persona } from "@/lib/agent/personas";
import { pickPersonaForCategory } from "@/lib/agent/personas-repo";
import { runAgentDirective } from "./agent-runner";
import { sendTextMessage } from "./api";
import {
	buildTransitionCrossSpecialistDirective,
	buildTransitionFirstContactDirective,
	buildTransitionReturningDirective,
} from "./directives";
import { transitionBridgeText } from "./formatter";
import { metaOf, persistMeta } from "./meta-helpers";

const TRANSITION_PAUSE_MS = 1200;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function transitionToSpecialist(args: {
	from: string;
	conversationId: string;
	fromPersona: Persona;
	toCategory: Category;
	expertiseHint?: string | null;
}): Promise<void> {
	const { from, conversationId, fromPersona, toCategory, expertiseHint } = args;

	let personaRow: Awaited<ReturnType<typeof pickPersonaForCategory>>;
	try {
		personaRow = await pickPersonaForCategory(toCategory, expertiseHint ?? null);
	} catch (err) {
		console.error(
			`[whatsapp-processor] No active specialist persona for category=${toCategory}:`,
			err,
		);
		await sendTextMessage(
			from,
			"Desculpe, estou com um problema momentâneo pra te conectar com o especialista. Pode tentar de novo em alguns instantes?",
		);
		return;
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

	// Specialist↔specialist switch drops faixa/prazo answers (they're category-specific).
	const updated: ConversationMetadata = {
		...meta,
		previousPersona: fromPersona,
		currentPersona: personaRow.id,
		currentCategory: toCategory,
		personasSeen: Array.from(seenSet),
		qualifyAnswers: fromConcierge ? meta.qualifyAnswers : undefined,
	};
	// Persist FIRST so runAgentDirective resolves the new specialist's voice.
	await persistMeta(conversationId, updated);

	// UX bridge: send a short system message announcing the connection BEFORE the
	// specialist takes over. Lets the user mentally prepare for the persona change.
	await sendTextMessage(
		from,
		transitionBridgeText({ name: personaRow.displayName, categoryLabel: meta0.label }),
	);
	await sleep(TRANSITION_PAUSE_MS);

	const offerCalibration = fromConcierge && !isReturning;
	const firstName = conv?.contactName?.trim().split(/\s+/)[0] ?? null;
	const nameHint = firstName
		? `O usuario se chama ${firstName}, voce pode usar o primeiro nome.`
		: "";

	if (offerCalibration) {
		// First contact with this specialist. The directive triggers Helena's welcome.
		// executeAgentTurn auto-fires the next gate at end of turn — Helena's text
		// becomes the prefix of the experience question, all in a single interactive
		// WhatsApp message (text + buttons).
		const directive = buildTransitionFirstContactDirective(meta0.label, nameHint);
		await runAgentDirective(from, conversationId, directive);
		return;
	}

	const directive = isReturning
		? buildTransitionReturningDirective()
		: buildTransitionCrossSpecialistDirective();

	await runAgentDirective(from, conversationId, directive);
}
