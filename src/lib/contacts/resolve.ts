// FIX-42 — resolução do cliente unificado (`contacts`).
//
// `resolveContact` é o ponto único de find-or-create do CLIENTE: recebe os
// identificadores capturados num ponto da jornada (telefone, CPF, e-mail) e
// devolve o contato correspondente, CONSOLIDANDO quando dois identificadores
// apontam pro mesmo cliente (ex.: já existia um contato pelo telefone e agora
// chega o CPF de outro registro → vira um só, FKs religadas).
//
// CPF raw por hora (DES-CPF-RAW) — esta camada nunca loga o CPF.

import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, contacts, conversations, leads } from "@/db/schema";
import { normalizePhoneBR } from "@/lib/leads/phone";

export type Contact = typeof contacts.$inferSelect;

export interface ContactInput {
	phone?: string | null;
	cpf?: string | null;
	email?: string | null;
	name?: string | null;
}

export interface NormalizedContactInput {
	phone: string | null;
	cpf: string | null;
	email: string | null;
	name: string | null;
}

const onlyDigits = (s: string): string => s.replace(/\D/g, "");

/**
 * Normaliza os identificadores pro formato canônico do banco:
 *  - phone → normalizePhoneBR (só dígitos, DDD, sem 55) ou null;
 *  - cpf   → 11 dígitos ou null (não valida DV aqui — captura faz isso);
 *  - email → trim + lowercase ou null;
 *  - name  → trim ou null.
 * Função PURA — base da Camada 1.
 */
export function normalizeContactInput(input: ContactInput): NormalizedContactInput {
	const phone = input.phone ? normalizePhoneBR(input.phone) : null;
	const cpfDigits = input.cpf ? onlyDigits(input.cpf) : "";
	const cpf = cpfDigits.length === 11 ? cpfDigits : null;
	const email = input.email ? input.email.trim().toLowerCase() || null : null;
	const name = input.name?.trim() || null;
	return { phone, cpf, email, name };
}

/** Tem ao menos um identificador resolvível? (invariante de contacts) */
export function hasIdentifier(n: NormalizedContactInput): boolean {
	return Boolean(n.phone || n.cpf || n.email);
}

/**
 * Consolida os identificadores de N contatos casados num único registro
 * primário, preferindo o valor já presente no primário, senão o do input,
 * senão o de algum secundário. Função PURA (Camada 1).
 */
export function consolidateIdentifiers(
	primary: Contact,
	others: Contact[],
	input: NormalizedContactInput,
): Pick<Contact, "phone" | "cpf" | "email" | "name"> {
	const pick = (field: "phone" | "cpf" | "email" | "name"): string | null =>
		primary[field] ?? input[field] ?? others.find((o) => o[field])?.[field] ?? null;
	return { phone: pick("phone"), cpf: pick("cpf"), email: pick("email"), name: pick("name") };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Ordena casados de forma determinística: mais antigo primeiro (createdAt, id). */
function pickPrimary(matches: Contact[]): { primary: Contact; others: Contact[] } {
	const sorted = [...matches].sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
	);
	return { primary: sorted[0], others: sorted.slice(1) };
}

/**
 * Encontra ou cria o contato pros identificadores dados, fazendo MERGE quando
 * mais de um contato existente casa (consolidação). Retorna `null` se nenhum
 * identificador resolvível foi passado (ex.: só nome) — não cria contato vazio.
 *
 * Roda numa transação: o merge move FKs (conversations/leads/bevi_proposals)
 * dos secundários pro primário e apaga os secundários — tudo atômico.
 */
export async function resolveContact(input: ContactInput): Promise<Contact | null> {
	const n = normalizeContactInput(input);
	if (!hasIdentifier(n)) return null;

	return db.transaction(async (tx) => resolveContactTx(tx, n));
}

async function resolveContactTx(tx: Tx, n: NormalizedContactInput): Promise<Contact> {
	const conds = [];
	if (n.phone) conds.push(eq(contacts.phone, n.phone));
	if (n.cpf) conds.push(eq(contacts.cpf, n.cpf));
	if (n.email) conds.push(eq(contacts.email, n.email));

	const matches = await tx
		.select()
		.from(contacts)
		.where(or(...conds));

	if (matches.length === 0) {
		const [created] = await tx
			.insert(contacts)
			.values({ phone: n.phone, cpf: n.cpf, email: n.email, name: n.name })
			.returning();
		return created;
	}

	const { primary, others } = pickPrimary(matches);

	// Move FKs dos secundários pro primário antes de apagá-los.
	for (const other of others) {
		await tx
			.update(conversations)
			.set({ contactId: primary.id })
			.where(eq(conversations.contactId, other.id));
		await tx.update(leads).set({ contactId: primary.id }).where(eq(leads.contactId, other.id));
		await tx
			.update(beviProposals)
			.set({ contactId: primary.id })
			.where(eq(beviProposals.contactId, other.id));
	}

	const merged = consolidateIdentifiers(primary, others, n);

	for (const other of others) {
		await tx.delete(contacts).where(eq(contacts.id, other.id));
	}

	const [updated] = await tx
		.update(contacts)
		.set({ ...merged, updatedAt: new Date() })
		.where(eq(contacts.id, primary.id))
		.returning();
	return updated;
}

/**
 * Lookup READ-ONLY do contato por telefone e/ou CPF — NUNCA cria (FIX-47:
 * recuperação cross-device não pode materializar contatos a partir de um número
 * digitado por qualquer um). Retorna o contato existente ou null.
 */
export async function findContactByIdentifier(input: {
	phone?: string | null;
	cpf?: string | null;
}): Promise<Contact | null> {
	const n = normalizeContactInput(input);
	const conds = [];
	if (n.phone) conds.push(eq(contacts.phone, n.phone));
	if (n.cpf) conds.push(eq(contacts.cpf, n.cpf));
	if (conds.length === 0) return null;

	const [match] = await db
		.select()
		.from(contacts)
		.where(or(...conds))
		.limit(1);
	return match ?? null;
}

/**
 * Resolve o contato e religa as FKs: grava `contactId` na conversa e/ou no lead
 * dados. Idempotente. Usado pelos pontos de captura (telefone/CPF/e-mail) pra
 * alimentar `contacts` daqui pra frente. Nunca lança — captura não pode quebrar
 * por causa de resolução de contato.
 */
export async function attachContact(opts: {
	conversationId?: string | null;
	leadId?: string | null;
	input: ContactInput;
}): Promise<string | null> {
	try {
		const contact = await resolveContact(opts.input);
		if (!contact) return null;
		if (opts.conversationId) {
			await db
				.update(conversations)
				.set({ contactId: contact.id })
				.where(eq(conversations.id, opts.conversationId));
		}
		if (opts.leadId) {
			await db.update(leads).set({ contactId: contact.id }).where(eq(leads.id, opts.leadId));
		}
		return contact.id;
	} catch (err) {
		console.error("[contacts] attachContact failed:", err);
		return null;
	}
}
