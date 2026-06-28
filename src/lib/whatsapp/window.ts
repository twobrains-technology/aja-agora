/**
 * Janela de 24h da WhatsApp Cloud API (FIX-86 / bloco-b chat-mesa).
 *
 * A API oficial da Meta só permite TEXTO LIVRE se o último inbound (mensagem
 * recebida do cliente) foi nos últimos 24h. Fora dessa janela, só template (HSM).
 * `lastInboundAt` é atualizado pelo webhook a cada mensagem recebida do cliente.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";

/** 24h em milissegundos — duração da janela de atendimento da Meta. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Janela aberta? Consulta o `lastInboundAt` da conversa. Sem inbound (ou inbound
 * há mais de 24h) → fechada (open=false). */
export async function isWindowOpen(conversationId: string): Promise<{
	open: boolean;
	expiresAt: Date | null;
}> {
	const [row] = await db
		.select({ lastInboundAt: conversations.lastInboundAt })
		.from(conversations)
		.where(eq(conversations.id, conversationId))
		.limit(1);

	if (!row?.lastInboundAt) return { open: false, expiresAt: null };

	const expiresAt = new Date(row.lastInboundAt.getTime() + WINDOW_MS);
	return { open: new Date() < expiresAt, expiresAt };
}

/** Versão pura (sem DB) — recebe o timestamp e diz se a janela está aberta.
 * Útil pro front (gate do input de chat) e pra testar a lógica sem I/O. */
export function isWindowOpenFast(lastInboundAt: Date | string | null): boolean {
	if (!lastInboundAt) return false;
	const inbound = typeof lastInboundAt === "string" ? new Date(lastInboundAt) : lastInboundAt;
	if (Number.isNaN(inbound.getTime())) return false;
	return new Date() < new Date(inbound.getTime() + WINDOW_MS);
}
