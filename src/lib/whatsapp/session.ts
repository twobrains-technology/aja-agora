import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import {
	loadConversationHistory,
	saveMessage as saveMessageWithChannel,
} from "@/lib/conversation/messages";
import { isSimulatedWaId } from "./simulator-bus";

export { loadConversationHistory };

// B-03: extrai phone do wa_id (sem prefixo 55 BR). Duplicado do
// proxy.ts:normalizeWaIdToPhone pra evitar import circular session→proxy.
function waIdToPhone(waId: string): string | null {
	const digits = waId.replace(/\D/g, "");
	if (!digits) return null;
	const stripped = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
	return stripped || null;
}

export async function getOrCreateConversation(
	waId: string,
): Promise<{ id: string; isNew: boolean }> {
	const existing = await db.query.conversations.findFirst({
		where: eq(conversations.waId, waId),
	});

	if (existing) return { id: existing.id, isNew: false };

	// B-03: conversa simulada (SIM-...) sempre marca is_simulated=true.
	// API admin/simulator/sessions também faz isso via update separado,
	// mas marcar aqui garante isolamento de qualquer caminho.
	const isSimulated = isSimulatedWaId(waId);

	const [conv] = await db
		.insert(conversations)
		.values({ waId, channel: "whatsapp", isSimulated })
		.returning();

	// B-03: cria lead JÁ no início, só com phone. Sem isso, conversa que
	// abandona antes de handoff/interest fica invisível no kanban (bug
	// reportado pelo Kairo). Lead herda is_simulated da conversation.
	// applyTrackedStageToLead só roda quando lead recebe stage real depois.
	try {
		const phone = waIdToPhone(waId);
		await db
			.insert(leads)
			.values({
				conversationId: conv.id,
				name: null,
				phone,
				email: null,
				isSimulated,
			})
			.onConflictDoNothing();
	} catch (err) {
		// Não bloqueia a criação da conversation se o insert do lead falhar
		// (ex: race condition raro). Lead pode ser criado depois via handoff.
		console.error(
			`[whatsapp-session] failed to seed lead for conversation ${conv.id}:`,
			err,
		);
	}

	console.log(
		`[whatsapp-session] New conversation ${conv.id} for wa_id ${waId} (simulated=${isSimulated})`,
	);
	return { id: conv.id, isNew: true };
}

export async function saveMessage(
	conversationId: string,
	role: "user" | "assistant",
	content: string,
	personaId?: string | null,
): Promise<string> {
	return saveMessageWithChannel(conversationId, role, content, "whatsapp", personaId);
}
