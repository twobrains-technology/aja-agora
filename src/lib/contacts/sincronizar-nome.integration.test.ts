// F2 / AJA-02 — o nome que o agente aprende precisa chegar a `contacts.name`.
//
// Antes deste helper, os TRÊS caminhos de escrita do nome (tool do modelo,
// extração determinística do gate `name` e pushName do WhatsApp) paravam em
// `conversations.contactName` / `leads.name`. A régua lê `contacts.name`
// (`remarketing-queries.ts`), então "Sem nome ainda" era o sintoma visível.
//
// Integração com banco real, como manda a pirâmide do repo: o que este arquivo
// protege é uma ESCRITA em três tabelas, com guardas de idempotência e de
// "nome mais completo não regride" — nada disso se prova com mock.
//
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Telefones únicos por execução (DDD 62) — o Postgres é compartilhado entre os
// agentes que rodam a suíte, e dois deles não podem semear o mesmo número.
const SUFIXO = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
const P1 = `6298${SUFIXO.slice(0, 7)}`;
const P2 = `6299${SUFIXO.slice(0, 7)}`;

describeIfDb("F2 — sincronizarNomeDoContato (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let sincronizarNomeDoContato: typeof import("./sincronizar-nome").sincronizarNomeDoContato;

	const convIds: string[] = [];
	const contactIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ sincronizarNomeDoContato } = await import("./sincronizar-nome"));
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

	/** Conversa + contato resolvido + lead, todos ligados — o estado de quem já
	 *  tem telefone capturado quando o nome chega (o caso da régua). */
	async function semearComContato(opts?: {
		contatoName?: string | null;
		leadName?: string | null;
	}) {
		// contacts exige ao menos um identificador (check constraint): o contato
		// nasce pelo telefone, como na vida real antes do nome chegar.
		const [contato] = await db
			.insert(schema.contacts)
			.values({ phone: P1, name: opts?.contatoName ?? null })
			.returning();
		contactIds.push(contato.id);

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", waId: P1, contactId: contato.id })
			.returning();
		convIds.push(conv.id);

		await db.insert(schema.leads).values({
			conversationId: conv.id,
			contactId: contato.id,
			name: opts?.leadName ?? null,
			phone: P1,
		});

		return { convId: conv.id, contactId: contato.id };
	}

	async function ler(convId: string, contactId: string) {
		const conv = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, convId),
			columns: { contactName: true },
		});
		const lead = await db.query.leads.findFirst({
			where: eq(schema.leads.conversationId, convId),
			columns: { name: true },
		});
		const contact = await db.query.contacts.findFirst({
			where: eq(schema.contacts.id, contactId),
			columns: { name: true },
		});
		return {
			contactName: conv?.contactName ?? null,
			leadName: lead?.name ?? null,
			contato: contact?.name ?? null,
		};
	}

	it("nome chega com contato já resolvido → as três casas ficam preenchidas", async () => {
		const { convId, contactId } = await semearComContato();

		const aplicado = await sincronizarNomeDoContato({
			conversationId: convId,
			nome: "Maria Graciete",
		});

		expect(aplicado).toBe("Maria Graciete");
		expect(await ler(convId, contactId)).toEqual({
			contactName: "Maria Graciete",
			leadName: "Maria Graciete",
			contato: "Maria Graciete",
		});
	});

	it("não regride: nome mais curto não troca o mais completo em contacts.name", async () => {
		const { convId, contactId } = await semearComContato({ contatoName: "Maria Graciete Silva" });

		await sincronizarNomeDoContato({ conversationId: convId, nome: "Maria" });

		const depois = await ler(convId, contactId);
		expect(depois.contato).toBe("Maria Graciete Silva");
	});

	it("nome mais completo SUBSTITUI o mais curto em contacts.name", async () => {
		const { convId, contactId } = await semearComContato({ contatoName: "Maria" });

		await sincronizarNomeDoContato({ conversationId: convId, nome: "Maria Graciete" });

		expect((await ler(convId, contactId)).contato).toBe("Maria Graciete");
	});

	it("não atropela um nome já gravado em conversations/leads (guarda isNull)", async () => {
		const { convId, contactId } = await semearComContato({ leadName: "Graciete" });
		await db
			.update(schema.conversations)
			.set({ contactName: "Maria" })
			.where(eq(schema.conversations.id, convId));

		await sincronizarNomeDoContato({ conversationId: convId, nome: "Zé" });

		const depois = await ler(convId, contactId);
		expect(depois.contactName).toBe("Maria");
		expect(depois.leadName).toBe("Graciete");
	});

	it("é idempotente: duas chamadas com o mesmo nome não mudam o estado", async () => {
		const { convId, contactId } = await semearComContato();

		await sincronizarNomeDoContato({ conversationId: convId, nome: "Helena" });
		const primeira = await ler(convId, contactId);
		await sincronizarNomeDoContato({ conversationId: convId, nome: "Helena" });

		expect(await ler(convId, contactId)).toEqual(primeira);
	});

	it("conversa SEM contato resolvido: grava a coluna do nome e não cria contato", async () => {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", waId: P2 })
			.returning();
		convIds.push(conv.id);

		await sincronizarNomeDoContato({ conversationId: conv.id, nome: "Ana" });

		const c = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, conv.id),
			columns: { contactName: true, contactId: true },
		});
		expect(c?.contactName).toBe("Ana");
		expect(c?.contactId).toBeNull();
	});

	it("nome vazio/em branco é no-op", async () => {
		const { convId } = await semearComContato();
		expect(await sincronizarNomeDoContato({ conversationId: convId, nome: "   " })).toBeNull();
	});

	it("conversa inexistente não explode", async () => {
		expect(
			await sincronizarNomeDoContato({
				conversationId: "00000000-0000-0000-0000-000000000000",
				nome: "Ninguém",
			}),
		).toBeNull();
	});
});
