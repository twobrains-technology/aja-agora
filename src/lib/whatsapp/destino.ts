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

import { desc, eq, isNotNull } from "drizzle-orm";
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

/**
 * A conversa desta PESSOA, achada pela chave canônica do telefone.
 *
 * Existe porque `eq(conversations.waId, from)` mente: o wa_id que a Meta entrega
 * para número brasileiro vem sem o nono dígito, e o que a web gravou vem com
 * ele. Em 2026-08-18 isso derrubou a mídia inbound — o cliente mandou o
 * documento, a busca exata não achou conversa nenhuma e o arquivo foi para o
 * chão (`[media-inbound] mídia sem conversa correspondente — ignorada`) enquanto
 * o `updateLastInboundAt` do mesmo webhook achava duas conversas do mesmo
 * telefone, porque ele já resolvia por chave.
 *
 * Preferência: conversa de WhatsApp (é o canal de onde a mídia veio) e, entre
 * elas, a mais recentemente movimentada.
 */
export async function conversaDoNumero(waId: string) {
	const chave = chaveTelefoneBR(waId);

	// Comparação em memória, como `updateLastInboundAt` e `window.ts` já fazem: o
	// formato do telefone varia demais entre as fontes para um LIKE confiável. Só
	// as colunas de que os dois chamadores precisam — a linha inteira de toda
	// conversa seria payload à toa num caminho que roda a cada anexo recebido.
	const candidatas = await db.query.conversations.findMany({
		columns: { id: true, waId: true, channel: true, metadata: true },
		orderBy: [desc(conversations.updatedAt)],
	});

	const daPessoa = candidatas.filter((c) =>
		chave ? chaveTelefoneBR(c.waId) === chave : c.waId === waId,
	);
	if (daPessoa.length === 0) return null;

	return daPessoa.find((c) => c.channel === "whatsapp") ?? daPessoa[0];
}
