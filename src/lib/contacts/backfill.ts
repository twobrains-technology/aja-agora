// FIX-42 — backfill idempotente de `contacts`.
//
// A tabela contacts nasce vazia. Este backfill consolida os dados de cliente que
// já existem (leads/conversas + CPF cifrado em conversations.metadata.identityEnc)
// em contatos reais e religa as FKs. Reusa `resolveContact` — então a deduplicação
// por telefone/CPF/e-mail acontece de graça (dois leads do mesmo telefone caem no
// mesmo contato via merge).
//
// Idempotente: processa só o que ainda não tem contactId; re-rodar é no-op
// (resolveContact é find-or-create). Roda DENTRO do container (job de release /
// `npm run db:backfill:contacts`) — NUNCA na mão contra o banco (CLAUDE.md).
//
// CPF decifrado aqui NUNCA é logado.

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { decryptIdentity } from "@/lib/conversation/identity";
import { resolveContact } from "./resolve";

export interface BackfillResult {
	contactsResolved: number;
	leadsLinked: number;
	conversationsLinked: number;
	skippedAnonymous: number;
}

/** Decifra o CPF+celular do meta de uma conversa. Falha silenciosa (sem chave/
 * blob inválido) → null. Nunca loga o conteúdo. */
function cpfFromMeta(metadata: unknown): { cpf: string | null; celular: string | null } {
	const enc = (metadata as { identityEnc?: string } | null)?.identityEnc;
	if (!enc) return { cpf: null, celular: null };
	try {
		const id = decryptIdentity(enc);
		return { cpf: id.cpf ?? null, celular: id.celular ?? null };
	} catch {
		return { cpf: null, celular: null };
	}
}

/**
 * Consolida leads + conversas existentes em `contacts` e religa FKs.
 * @param opts.force quando true, reprocessa mesmo registros já linkados (raro;
 *   default false = só os sem contactId, pra ser barato e idempotente).
 */
export async function backfillContacts(opts: { force?: boolean } = {}): Promise<BackfillResult> {
	const force = opts.force ?? false;
	const result: BackfillResult = {
		contactsResolved: 0,
		leadsLinked: 0,
		conversationsLinked: 0,
		skippedAnonymous: 0,
	};

	// 1) Leads com identificador (phone/email) → resolve + religa lead e conversa.
	const leadRows = await db
		.select({
			id: leads.id,
			conversationId: leads.conversationId,
			contactId: leads.contactId,
			phone: leads.phone,
			email: leads.email,
			name: leads.name,
			metadata: conversations.metadata,
		})
		.from(leads)
		.innerJoin(conversations, eq(leads.conversationId, conversations.id))
		.where(force ? undefined : isNull(leads.contactId));

	for (const row of leadRows) {
		const { cpf } = cpfFromMeta(row.metadata);
		const contact = await resolveContact({
			phone: row.phone,
			email: row.email,
			name: row.name,
			cpf,
		});
		if (!contact) {
			result.skippedAnonymous += 1;
			continue;
		}
		result.contactsResolved += 1;
		await db.update(leads).set({ contactId: contact.id }).where(eq(leads.id, row.id));
		result.leadsLinked += 1;
		await db
			.update(conversations)
			.set({ contactId: contact.id })
			.where(eq(conversations.id, row.conversationId));
		result.conversationsLinked += 1;
	}

	// 2) Conversas com identityEnc (CPF cifrado) mas sem lead linkado ainda
	//    (ex.: identificou mas abandonou antes de virar lead). Decifra → resolve.
	const convRows = await db
		.select({
			id: conversations.id,
			contactId: conversations.contactId,
			waId: conversations.waId,
			contactName: conversations.contactName,
			metadata: conversations.metadata,
		})
		.from(conversations)
		.where(
			and(
				force ? undefined : isNull(conversations.contactId),
				sql`${conversations.metadata} ->> 'identityEnc' IS NOT NULL`,
			),
		);

	for (const row of convRows) {
		const { cpf, celular } = cpfFromMeta(row.metadata);
		const contact = await resolveContact({
			cpf,
			phone: celular ?? row.waId,
			name: row.contactName,
		});
		if (!contact) {
			result.skippedAnonymous += 1;
			continue;
		}
		result.contactsResolved += 1;
		await db
			.update(conversations)
			.set({ contactId: contact.id })
			.where(eq(conversations.id, row.id));
		result.conversationsLinked += 1;
	}

	return result;
}
