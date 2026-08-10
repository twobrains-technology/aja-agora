"use server";

import { inArray } from "drizzle-orm";
import { globalDb } from "@/db";
import { conversations } from "@/db/schema";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";

/**
 * Abre a janela de 24h: o cliente falou, então a Meta libera texto livre.
 *
 * Chamada pelo webhook a cada mensagem recebida. Marca TODAS as conversas
 * daquela pessoa — a janela é do número, e o mesmo cliente costuma ter uma
 * conversa por canal.
 *
 * ## Por que não é mais `waId = from`
 *
 * Era, e nunca casava. A Meta manda `from` como "5562998127649" (com DDI, sem o
 * nono dígito); a conversa criada pelo site guarda "62998127649", que foi o que o
 * cliente digitou. O `SELECT` não achava nada, o log dizia "No conversation
 * found", e `lastInboundAt` ficava NULL PARA SEMPRE.
 *
 * O efeito em prod (2026-08-10) foi o atendente mandando template atrás de
 * template: o cliente respondia, a janela continuava fechada aos olhos do
 * sistema, e cada mensagem nova do atendente virava outro contato de retomada. O
 * cliente recebeu o mesmo "Oi, Neto! Tudo bem?" duas vezes em um minuto.
 *
 * A leitura da janela já resolvia por chave canônica (`isWindowOpen`); faltava a
 * ESCRITA — sem ela, não havia o que ler.
 */
export async function updateLastInboundAt(from: string, _messageId: string) {
	const db = globalDb;
	if (!db) {
		console.warn("[whatsapp] globalDb not available in updateLastInboundAt");
		return;
	}

	try {
		const chave = chaveTelefoneBR(from);

		// Comparação em memória: o formato varia demais entre as fontes pra um LIKE
		// confiável, e a tabela de conversas é pequena o bastante pra isso.
		const candidatas = await db
			.select({ id: conversations.id, waId: conversations.waId })
			.from(conversations);

		const alvos = candidatas
			.filter((c) => (chave ? chaveTelefoneBR(c.waId) === chave : c.waId === from))
			.map((c) => c.id);

		if (alvos.length === 0) {
			console.log(`[whatsapp] No conversation found for phone ${from}`);
			return;
		}

		const agora = new Date();
		await db
			.update(conversations)
			.set({ lastInboundAt: agora, updatedAt: agora })
			.where(inArray(conversations.id, alvos))
			.execute();

		console.log(
			`[whatsapp] Updated lastInboundAt for ${alvos.length} conversation(s) (phone: ${from})`,
		);
	} catch (err) {
		console.error("[whatsapp] Error updating lastInboundAt:", err);
	}
}
