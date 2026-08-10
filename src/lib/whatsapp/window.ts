/**
 * Janela de 24h da WhatsApp Cloud API (FIX-86 / bloco-b chat-mesa).
 *
 * A API oficial da Meta só permite TEXTO LIVRE se o último inbound (mensagem
 * recebida do cliente) foi nos últimos 24h. Fora dessa janela, só template (HSM).
 * `lastInboundAt` é atualizado pelo webhook a cada mensagem recebida do cliente.
 */

import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { chaveTelefoneBR } from "./mesmo-numero";

/** 24h em milissegundos — duração da janela de atendimento da Meta. */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Janela aberta?
 *
 * A janela é do NÚMERO, não da conversa — é assim que a Meta conta. Um cliente
 * que falou com o agente no site e depois mandou "bom dia" no WhatsApp tem a
 * janela aberta, mesmo que o card do pipeline aponte pra conversa do site.
 *
 * Olhar só `conversations.lastInboundAt` da linha atual dizia "fechada" nesse
 * caso, e o atendente era obrigado a disparar um template pra alguém que estava
 * conversando com ele naquele minuto (prod, 2026-08-10). Por isso o inbound é
 * procurado em TODAS as conversas do mesmo telefone.
 *
 * Sem inbound (ou inbound há mais de 24h) → fechada.
 */
export async function isWindowOpen(conversationId: string): Promise<{
	open: boolean;
	expiresAt: Date | null;
}> {
	const [row] = await db
		.select({ lastInboundAt: conversations.lastInboundAt, waId: conversations.waId })
		.from(conversations)
		.where(eq(conversations.id, conversationId))
		.limit(1);

	if (!row) return { open: false, expiresAt: null };

	let ultimoInbound = row.lastInboundAt ?? null;

	const chave = chaveTelefoneBR(row.waId);
	if (chave) {
		// Só as que TÊM inbound: a comparação por chave acontece em memória (o
		// formato varia demais pra um LIKE confiável), então trazer o resto seria
		// varrer a tabela à toa.
		const candidatas = await db
			.select({ waId: conversations.waId, lastInboundAt: conversations.lastInboundAt })
			.from(conversations)
			.where(isNotNull(conversations.lastInboundAt));

		for (const c of candidatas) {
			if (chaveTelefoneBR(c.waId) !== chave) continue;
			if (!c.lastInboundAt) continue;
			if (!ultimoInbound || c.lastInboundAt > ultimoInbound) ultimoInbound = c.lastInboundAt;
		}
	}

	if (!ultimoInbound) return { open: false, expiresAt: null };

	const expiresAt = new Date(ultimoInbound.getTime() + WINDOW_MS);
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
