// FIX-45 — agregação da visão consolidada do contato. Separada da rota pra ser
// testável sem auth (integration DB real). CPF mascarado por default.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { STAGE_ORDER } from "@/lib/admin/lead-stages";
import { maskCpf } from "@/lib/conversation/identity";

/**
 * FIX-50 — proposta VIGENTE do contato. Regra: a mais avançada NÃO-terminal,
 * desempate por recência. "Avanço" usa a raia do lead vinculado (STAGE_ORDER é
 * canônica e bem-ordenada — o `proposalStatus` da Bevi é texto livre). Propostas
 * de lead `perdido` são descartadas; se TODAS forem perdidas, ainda marca a mais
 * recente (não deixa o card sem "Atual"). Pura (testável sem DB).
 */
export function deriveCurrentProposalId(
	proposals: { id: string; leadId: string | null; createdAt: Date | string }[],
	leadStageById: Map<string, string>,
): string | null {
	if (proposals.length === 0) return null;
	const ranked = proposals.map((p) => {
		const stage = p.leadId ? (leadStageById.get(p.leadId) ?? null) : null;
		return {
			id: p.id,
			lost: stage === "perdido",
			stageRank: stage ? STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]) : -1,
			ts: new Date(p.createdAt).getTime(),
		};
	});
	const live = ranked.filter((r) => !r.lost);
	const pool = live.length > 0 ? live : ranked;
	pool.sort((a, b) => b.stageRank - a.stageRank || b.ts - a.ts);
	return pool[0]?.id ?? null;
}

/** FIX-50 — conversa ATIVA do contato (a que ainda está rodando): status `active`
 * mais recente. Null quando nenhuma está ativa (todas closed/handed_off). Pura. */
export function deriveActiveConversationId(
	conversations: { id: string; status: string; updatedAt: Date | string }[],
): string | null {
	const active = conversations
		.filter((c) => c.status === "active")
		.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
	return active[0]?.id ?? null;
}

export async function getContactDetail(id: string) {
	const contact = await db.query.contacts.findFirst({
		where: eq(contacts.id, id),
		with: {
			conversations: {
				with: {
					messages: {
						orderBy: (m, { asc }) => [asc(m.createdAt)],
						with: { artifacts: true },
					},
				},
			},
			leads: { with: { events: true } },
			beviProposals: true,
		},
	});

	if (!contact) return null;

	// Canais usados (web/WhatsApp), distintos.
	const channels = [...new Set(contact.conversations.map((c) => c.channel))];

	// Raia atual = a mais avançada entre os leads do contato.
	const currentStage =
		contact.leads
			.map((l) => l.stage)
			.sort((a, b) => STAGE_ORDER.indexOf(b) - STAGE_ORDER.indexOf(a))[0] ?? null;

	// Timeline unificada cross-channel: todas as mensagens de todas as conversas,
	// com selo de canal + status da conversa por mensagem (FIX-50: sinaliza qual
	// conversa ainda está rodando), ordenadas no tempo.
	const timeline = contact.conversations
		.flatMap((conv) =>
			conv.messages.map((msg) => ({
				id: msg.id,
				conversationId: conv.id,
				channel: conv.channel,
				conversationStatus: conv.status,
				role: msg.role,
				content: msg.content,
				createdAt: msg.createdAt,
				artifacts: msg.artifacts,
			})),
		)
		.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

	// FIX-50: o "presente" — qual proposta importa e qual conversa está ativa.
	const leadStageById = new Map(contact.leads.map((l) => [l.id, l.stage] as const));
	const currentProposalId = deriveCurrentProposalId(contact.beviProposals, leadStageById);
	const activeConversationId = deriveActiveConversationId(contact.conversations);

	// Histórico de movimentação no funil (todos os leads), ordenado no tempo.
	const stageHistory = contact.leads
		.flatMap((l) => l.events)
		.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

	return {
		contact: {
			id: contact.id,
			name: contact.name,
			phone: contact.phone,
			cpf: contact.cpf ? maskCpf(contact.cpf) : null, // mascarado por default
			email: contact.email,
			createdAt: contact.createdAt,
		},
		channels,
		currentStage,
		conversationCount: contact.conversations.length,
		timeline,
		proposals: contact.beviProposals,
		// FIX-50: hierarquiza o presente — a vigente e a conversa ativa.
		currentProposalId,
		activeConversationId,
		stageHistory,
	};
}

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContactDetail>>>;
