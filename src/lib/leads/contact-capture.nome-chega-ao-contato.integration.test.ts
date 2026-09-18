// F2 / AJA-02 — o nome chega a `contacts.name` pelos dois caminhos de captura.
//
// O furo medido em produção: a tool `save_contact_name` gravava só
// `conversations.contactName` + `leads.name`; quem já tinha telefone resolvido
// continuava "Sem nome ainda" na régua (que lê `contacts.name`). E o inverso
// também: quando o nome chegava ANTES do telefone, `saveContactWhatsapp` casava
// o contato passando só o telefone — o nome já sabido se perdia.
//
// Integração com banco real: são escritas em três tabelas, não dá para provar
// com mock. Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Telefones únicos por execução (DDD 62) — Postgres compartilhado entre agentes.
const SUFIXO = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
const P1 = `6298${SUFIXO.slice(0, 7)}`;
const P2 = `6299${SUFIXO.slice(0, 7)}`;
const P3 = `6297${SUFIXO.slice(0, 7)}`;

describeIfDb("F2 — nome capturado chega a contacts.name (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let saveContactName: typeof import("./contact-capture").saveContactName;
	let saveContactWhatsapp: typeof import("./contact-capture").saveContactWhatsapp;

	const convIds: string[] = [];
	const contactIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ saveContactName, saveContactWhatsapp } = await import("./contact-capture"));
		await cleanup();
	});

	afterAll(async () => {
		await cleanup();
	});

	async function cleanup() {
		if (convIds.length) {
			await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (contactIds.length) {
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
		}
		convIds.length = 0;
		contactIds.length = 0;
	}

	async function semearConversa(opts?: { contatoPhone?: string | null }) {
		let contactId: string | null = null;
		if (opts?.contatoPhone) {
			const [contato] = await db
				.insert(schema.contacts)
				.values({ phone: opts.contatoPhone })
				.returning();
			contactId = contato.id;
			contactIds.push(contato.id);
		}
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", waId: P1, contactId })
			.returning();
		convIds.push(conv.id);
		return conv.id;
	}

	async function nomeDoContato(contactId: string) {
		const c = await db.query.contacts.findFirst({
			where: eq(schema.contacts.id, contactId),
			columns: { name: true },
		});
		return c?.name ?? null;
	}

	it("saveContactName com contato já resolvido → contacts.name preenchido", async () => {
		const convId = await semearConversa({ contatoPhone: P1 });
		const conv = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, convId),
			columns: { contactId: true },
		});
		expect(conv?.contactId).toBeTruthy();
		if (!conv?.contactId) return;

		const r = await saveContactName(convId, "Kairo");

		expect(r.ok).toBe(true);
		expect(await nomeDoContato(conv.contactId)).toBe("Kairo");
	});

	it("nome ANTES do telefone: saveContactWhatsapp casa o contato levando o nome já sabido", async () => {
		const convId = await semearConversa();

		// 1) o nome chega primeiro — sem telefone, não há contato (correto).
		expect((await saveContactName(convId, "Helena")).ok).toBe(true);
		const semContato = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, convId),
			columns: { contactId: true, contactName: true },
		});
		expect(semContato?.contactId).toBeNull();
		expect(semContato?.contactName).toBe("Helena");

		// 2) o telefone chega depois → o contato nasce JÁ com o nome.
		expect((await saveContactWhatsapp(convId, P2)).ok).toBe(true);

		const [contato] = await db
			.select({ id: schema.contacts.id, name: schema.contacts.name })
			.from(schema.contacts)
			.where(eq(schema.contacts.phone, P2));
		expect(contato).toBeTruthy();
		if (!contato) return;
		contactIds.push(contato.id);
		expect(contato.name).toBe("Helena");
	});

	it("contato já existente com nome nulo: o nome sabido preenche no casamento por telefone", async () => {
		const convId = await semearConversa({ contatoPhone: P3 });
		// nome conhecido na conversa, mas o contato (já resolvido) continua nulo
		await db
			.update(schema.conversations)
			.set({ contactName: "Ana" })
			.where(eq(schema.conversations.id, convId));
		await db.insert(schema.leads).values({ conversationId: convId, phone: P3 });

		expect((await saveContactWhatsapp(convId, P3)).ok).toBe(true);

		const conv = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, convId),
			columns: { contactId: true },
		});
		expect(conv?.contactId).toBeTruthy();
		if (!conv?.contactId) return;
		expect(await nomeDoContato(conv.contactId)).toBe("Ana");
	});
});
