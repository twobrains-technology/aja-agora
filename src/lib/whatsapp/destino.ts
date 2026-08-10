/**
 * Para qual número o WhatsApp deve sair.
 *
 * O telefone digitado no site não é necessariamente o identificador que a Meta
 * usa. Para o Brasil ela costuma devolver o wa_id sem o nono dígito
 * ("556292496793"), enquanto o cliente digita com ele ("62992496793").
 *
 * Quando já existe uma conversa de WhatsApp desse mesmo número, o wa_id dela é a
 * melhor fonte possível: é literalmente o endereço de onde uma mensagem já
 * chegou. Só quando não existe é que caímos no E.164 derivado do que foi
 * digitado.
 *
 * Isso importa mais do que parece: "62992496793" sem DDI é lido pela Meta como
 * +62 — código de país da Indonésia. O envio é aceito e não chega em ninguém.
 */

import { eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { normalizePhoneBR } from "@/lib/memory/identity";
import { chaveTelefoneBR } from "./mesmo-numero";

export async function resolverDestinoWhatsApp(waId: string): Promise<string> {
	const fallback = normalizePhoneBR(waId)?.replace("+", "") ?? waId;

	const chave = chaveTelefoneBR(waId);
	if (!chave) return fallback;

	// Conversa de WhatsApp = número confirmado pela própria Meta.
	const candidatas = await db.query.conversations.findMany({
		where: eq(conversations.channel, "whatsapp"),
		columns: { waId: true },
	});

	for (const c of candidatas) {
		if (c.waId && chaveTelefoneBR(c.waId) === chave) return c.waId;
	}

	return fallback;
}

/** Conversas do mesmo número que já receberam inbound — usado pela janela de 24h. */
export async function conversasComInbound() {
	return db
		.select({ waId: conversations.waId, lastInboundAt: conversations.lastInboundAt })
		.from(conversations)
		.where(isNotNull(conversations.lastInboundAt));
}
