// F2 / AJA-02 — sincronização do nome aprendido nas TRÊS casas onde ele vive.
//
// O nome que o agente descobre chegava só a `conversations.contactName` e
// `leads.name`. A régua de remarketing lê `contacts.name` (`remarketing-queries.ts`,
// coluna `nome`), então todo contato que já tinha telefone resolvido continuava
// "Sem nome ainda" na tela — o sintoma literal que o Kairo pediu para corrigir
// ("quando o agente souber o nome dela, ele já preencha lá no nosso cadastro").
//
// Este é o PONTO ÚNICO de escrita, para os três caminhos (tool `save_contact_name`,
// extração determinística do gate `name` e pushName do WhatsApp) não divergirem.
//
// Guardas, e por que cada uma:
//  - `isNull` em conversations/leads: o nome que já está gravado é mais confiável
//    que um pushName que chega a cada mensagem da Meta; sem a guarda, todo turno
//    reescreveria a coluna.
//  - `length(contacts.name) < length(nome)` em contacts: nunca trocar um nome
//    mais completo por um mais curto. "Maria Graciete Silva" → "Maria" (do
//    pushName, por exemplo) é perda de dado, não correção.
//
// NÃO cria contato: `resolveContact` exige phone/cpf/email de propósito
// (`src/lib/contacts/resolve.ts`) — nome sozinho não materializa cliente.

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, leads } from "@/db/schema";

/**
 * Grava `nome` em `conversations.contactName`, `leads.name` e — quando a conversa
 * já tem contato resolvido — em `contacts.name`. Idempotente.
 *
 * @returns o nome aplicado (trimado) ou `null` quando vazio/em branco ou quando a
 *          conversa não existe.
 */
export async function sincronizarNomeDoContato(opts: {
	conversationId: string;
	nome: string | null | undefined;
}): Promise<string | null> {
	const nome = opts.nome?.trim();
	if (!nome) return null;

	const conv = await db.query.conversations.findFirst({
		where: eq(conversations.id, opts.conversationId),
		columns: { id: true, contactId: true },
	});
	if (!conv) return null;

	const agora = new Date();

	await db
		.update(conversations)
		.set({ contactName: nome, updatedAt: agora })
		.where(and(eq(conversations.id, conv.id), isNull(conversations.contactName)));

	await db
		.update(leads)
		.set({ name: nome, updatedAt: agora })
		.where(and(eq(leads.conversationId, conv.id), isNull(leads.name)));

	if (conv.contactId) {
		await db
			.update(contacts)
			.set({ name: nome, updatedAt: agora })
			.where(
				and(
					eq(contacts.id, conv.contactId),
					or(isNull(contacts.name), sql`length(${contacts.name}) < ${nome.length}`),
				),
			);
	}

	return nome;
}
