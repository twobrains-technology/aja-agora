// A REENTRADA MANUAL ALCANÇA O LEAD DA WEB (FIX-438, D9).
//
// `candidatosDaReentrada` pré-filtrava por `last_inbound_at IS NOT NULL` — e a
// web NUNCA escreve essa coluna. Resultado: o lead da web nem entrava no recorte
// da reentrada manual (não só era recusado). O silêncio dele é a última FALA do
// cliente (`messages.role='user'`), o mesmo fato que a entrada e o guard usam.
//
// Integração contra Postgres real: o defeito está na consulta, e um mock
// afirmaria o SQL que o teste imaginou. A prova é RELATIVA (o recorte é global,
// sobre o banco do workspace): o delta de `avaliadas`/`entram` antes e depois de
// semear a conversa da web. Nada é gravado — `dryRun`.
//
// Para o delta ser determinístico mesmo com outros arquivos de teste rodando em
// paralelo (que semeiam conversas com datas recentes), o `agora` do teste é
// HISTÓRICO: o recorte só tem `<= piso` (sem piso inferior), então uma âncora de
// 2020 deixa a janela vazia exceto pela fixture — o banco tem dados a partir de
// 2026.
//
// Skip quando não há DATABASE_URL.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const MIN = 60 * 1000;
const SUF = String(Math.floor(Math.random() * 9000) + 1000);

describeIfDb("a reentrada manual do lead da web (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let reentrarEmLote: typeof import("./remarketing-reentrada").reentrarEmLote;

	const convIds: string[] = [];
	const contactIds: string[] = [];
	const envAntes = {
		REMARKETING_ATIVO: process.env.REMARKETING_ATIVO,
		REMARKETING_ENTRADA_WEB: process.env.REMARKETING_ENTRADA_WEB,
	};

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ reentrarEmLote } = await import("./remarketing-reentrada"));

		process.env.REMARKETING_ATIVO = "1";
		process.env.REMARKETING_ENTRADA_WEB = "1";
	});

	afterAll(async () => {
		process.env.REMARKETING_ATIVO = envAntes.REMARKETING_ATIVO;
		process.env.REMARKETING_ENTRADA_WEB = envAntes.REMARKETING_ENTRADA_WEB;
		if (!db || convIds.length === 0) return;
		await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
	});

	/** Uma web parada logo acima do piso — entra no topo da ordenação do recorte. */
	async function semearWebParada(agora: Date): Promise<string> {
		const [contact] = await db
			.insert(schema.contacts)
			.values({ phone: `55629${SUF}77` })
			.returning({ id: schema.contacts.id });
		contactIds.push(contact.id);

		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				status: "active",
				contactName: `fixture-b7b-reentrada-${SUF}`,
				contactId: contact.id,
				lastInboundAt: null,
				isSimulated: false,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		await db.insert(schema.messages).values({
			conversationId: conv.id,
			role: "user",
			content: "Quero simular um financiamento",
			channel: "web",
			createdAt: new Date(agora.getTime() - 91 * MIN),
		});
		return conv.id;
	}

	/** A âncora histórica em 2020 mantém a janela do recorte só com a fixture. */
	const AGORA = new Date("2020-06-01T13:31:00Z");

	it("o lead da web parado entra no recorte e é aceito (não fica em silêncio)", async () => {
		const antes = await reentrarEmLote({
			agora: AGORA,
			por: "teste",
			porId: "teste",
			dryRun: true,
		});

		await semearWebParada(AGORA);

		const depois = await reentrarEmLote({
			agora: AGORA,
			por: "teste",
			porId: "teste",
			dryRun: true,
		});

		// A conversa nova entra no recorte (+1 avaliada) e com veredito de reentrada.
		expect(depois.avaliadas).toBe(antes.avaliadas + 1);
		expect(depois.entram).toBe(antes.entram + 1);
		// E não cai no balde de silêncio: a fala do cliente é a referência.
		expect(depois.ficaramDeFora.ainda_em_silencio ?? 0).toBe(
			antes.ficaramDeFora.ainda_em_silencio ?? 0,
		);
	});
});
