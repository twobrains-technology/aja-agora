// FIX-45 — agregação da visão consolidada do contato. Separada da rota pra ser
// testável sem auth (integration DB real). CPF mascarado por default.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { STAGE_ORDER } from "@/lib/admin/lead-stages";
import { maskCpf } from "@/lib/conversation/identity";

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
	// com selo de canal por mensagem, ordenadas no tempo.
	const timeline = contact.conversations
		.flatMap((conv) =>
			conv.messages.map((msg) => ({
				id: msg.id,
				conversationId: conv.id,
				channel: conv.channel,
				role: msg.role,
				content: msg.content,
				createdAt: msg.createdAt,
				artifacts: msg.artifacts,
			})),
		)
		.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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
		stageHistory,
	};
}

export type ContactDetail = NonNullable<Awaited<ReturnType<typeof getContactDetail>>>;
