import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { findUnclaimedWhatsAppVisit } from "@/lib/attribution/visit-store";
import { attachContact } from "@/lib/contacts";
import {
	loadConversationHistory,
	saveMessage as saveMessageWithChannel,
} from "@/lib/conversation/messages";
import { registrarInicioDeConversa } from "@/lib/conversions/inicio-de-conversa";
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
	/**
	 * A visita que o webhook JÁ resolveu para este número, quando resolveu.
	 *
	 * Existe por causa de uma ordem que não fechava (30/08/2026): o carimbo de
	 * origem do site (`vincularVisitaDoSite`) chama esta função para garantir que
	 * a conversa exista, e só DEPOIS grava o `visit_id`. Como o evento de início
	 * de conversa nasce aqui dentro — e é idempotente pela chave —, ele saía sem
	 * `fbc`, sem `fbp` e sem visita justamente para o tráfego que o item A3
	 * existe para recuperar: as 58 pessoas que saem pelo botão flutuante.
	 *
	 * `%Conv Chat` consertava; o sinal que ensina a campanha, não.
	 */
	visitaJaResolvida?: string | null,
): Promise<{ id: string; isNew: boolean }> {
	const existing = await db.query.conversations.findFirst({
		where: eq(conversations.waId, waId),
	});

	if (existing) return { id: existing.id, isNew: false };

	// B-03: conversa simulada (SIM-...) sempre marca is_simulated=true.
	// API admin/simulator/sessions também faz isso via update separado,
	// mas marcar aqui garante isolamento de qualquer caminho.
	const isSimulated = isSimulatedWaId(waId);

	// Origem do anúncio Click-to-WhatsApp: o webhook já gravou a visita quando a
	// primeira mensagem trouxe `referral`. Aqui a conversa a reivindica. Conversa
	// simulada nunca reivindica — atribuição de teste sujaria o relatório da
	// campanha, que é o que decide onde a verba vai.
	// A visita do SITE (carimbo de origem) tem precedência sobre a busca por
	// clique de anúncio: quando ela chega por parâmetro, o webhook já a resolveu
	// pelo código carimbado na fala — é fato, não heurística de janela.
	const visitId = isSimulated
		? null
		: (visitaJaResolvida ?? (await findUnclaimedWhatsAppVisit(waId)));

	const [conv] = await db
		.insert(conversations)
		.values({ waId, channel: "whatsapp", isSimulated, visitId })
		.returning();

	if (visitId) {
		console.log(`[whatsapp-session] Conversa ${conv.id} atribuída à visita ${visitId} (anúncio)`);
	}

	// B-03: cria lead JÁ no início, só com phone. Sem isso, conversa que
	// abandona antes de handoff/interest fica invisível no kanban (bug
	// reportado pelo Kairo). Lead herda is_simulated da conversation.
	// applyTrackedStageToLead só roda quando lead recebe stage real depois.
	try {
		const phone = waIdToPhone(waId);
		const [seededLead] = await db
			.insert(leads)
			.values({
				conversationId: conv.id,
				name: null,
				phone,
				email: null,
				isSimulated,
			})
			.onConflictDoNothing()
			.returning({ id: leads.id });
		// FIX-42: religa cliente unificado pelo telefone do WhatsApp. Simulados
		// (SIM-...) não geram phone normalizável → attachContact é no-op.
		if (phone && !isSimulated) {
			await attachContact({ conversationId: conv.id, leadId: seededLead?.id, input: { phone } });
		}
	} catch (err) {
		// Não bloqueia a criação da conversation se o insert do lead falhar
		// (ex: race condition raro). Lead pode ser criado depois via handoff.
		console.error(`[whatsapp-session] failed to seed lead for conversation ${conv.id}:`, err);
	}

	// B3 — o "início de conversa" também no WhatsApp (30/08/2026).
	//
	// Na web este evento nasce no navegador (abertura do teatro) e é confirmado
	// pelo beacon; aqui não existe navegador nenhum, então o servidor é o ÚNICO
	// lugar onde ele pode nascer — e é justamente o caso em que o caminho
	// client-side sozinho deixaria a campanha cega.
	//
	// E é o evento de melhor correspondência que esta operação produz: o `waId`
	// É o telefone da pessoa, conhecido desde o primeiro segundo. Na medição de
	// EMQ (item B2) nenhum evento saía com e-mail; o telefone é o que temos, e
	// aqui ele vem de graça.
	//
	// `conv.id` como `eventId` porque a conversa de WhatsApp é criada uma vez só
	// (idempotente pelo `wa_id`) — então a chave é naturalmente única e o
	// reprocessamento de webhook não vira segundo sinal.
	//
	// `await` e não `void`: a função nunca lança (tem try/catch próprio) e faz
	// duas consultas locais — menos do que a criação da conversa logo acima já
	// fez. O que o `void` custava era determinismo: o evento podia não existir
	// quando o turno seguinte o procurasse, e um teste de integração não tinha
	// como afirmar que ele nasceu com a origem certa. Sinal de mídia que talvez
	// exista não é sinal.
	if (!isSimulated) {
		await registrarInicioDeConversa({
			eventId: conv.id,
			visitId,
			conversationId: conv.id,
		});
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
