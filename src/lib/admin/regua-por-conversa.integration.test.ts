// A COLUNA RÉGUA LÊ A FALA DO CLIENTE — contra o Postgres, não contra mock.
//
// O par de integração do `regua-por-conversa.test.ts`: lá a decisão é provada com
// fatos montados à mão; aqui o que se prova é a CONSULTA que alimenta a tela —
// que `fatosDeConversas` traz a última fala do cliente (`messages.role='user'`)
// para a conversa da web. Sem isso, a coluna "Régua" continuaria dizendo "ainda
// em silêncio" para um lead que o worker já inscreveu: duas verdades para a
// mesma pergunta, que é o defeito que o D9 fecha.
//
// Skip quando não há DATABASE_URL.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

/** 09:00 de 17/09/2026 em Brasília (12:00 UTC). */
const AGORA = new Date("2026-09-17T12:00:00Z");
const MIN = 60 * 1000;
/** Telefones sorteados por execução: o banco é compartilhado entre os agentes. */
const SUF = String(Math.floor(Math.random() * 9000) + 1000);
const ENV_WEB = { REMARKETING_ATIVO: "1", REMARKETING_ENTRADA_WEB: "1" };

describeIfDb("fatosDeConversas — a fala do cliente na web (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let regua: typeof import("./regua-por-conversa");

	const convIds: string[] = [];
	const contactIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		regua = await import("./regua-por-conversa");
	});

	afterAll(async () => {
		if (convIds.length) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (contactIds.length) {
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
		}
	});

	/**
	 * Uma conversa da WEB com telefone no cadastro — e, quando pedida, uma fala
	 * do cliente. A web NUNCA grava `last_inbound_at`: quem escreve a coluna é o
	 * webhook do WhatsApp.
	 */
	async function semearWeb(sufixo: string, falaEm: Date | null) {
		const [contact] = await db
			.insert(schema.contacts)
			.values({ phone: `55629${SUF}${sufixo}` })
			.returning({ id: schema.contacts.id });
		contactIds.push(contact.id);

		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				status: "active",
				waId: null,
				contactId: contact.id,
				lastInboundAt: null,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		if (falaEm) {
			await db.insert(schema.messages).values({
				conversationId: conv.id,
				role: "user",
				content: "Quero simular um financiamento",
				channel: "web",
				createdAt: falaEm,
			});
		}
		return { conversationId: conv.id, contactId: contact.id };
	}

	it("traz a última fala do cliente — o silêncio que a tela vai contar", async () => {
		const { conversationId } = await semearWeb("0001", new Date(AGORA.getTime() - 200 * MIN));
		// Uma fala do ASSISTENTE e uma do cliente depois dela: o que vale é a
		// última fala do CLIENTE (a do assistente não conta como silêncio dele).
		await db.insert(schema.messages).values({
			conversationId,
			role: "assistant",
			content: "Claro, me diga o valor",
			channel: "web",
			createdAt: new Date(AGORA.getTime() - 150 * MIN),
		});
		await db.insert(schema.messages).values({
			conversationId,
			role: "user",
			content: "Pode ser R$ 900 por mês",
			channel: "web",
			createdAt: new Date(AGORA.getTime() - 100 * MIN),
		});

		const [fatos] = await regua.fatosDeConversas([conversationId]);

		expect(fatos.lastInboundAt).toBeNull();
		expect(fatos.ultimaMensagemDoClienteEm?.toISOString()).toBe(
			new Date(AGORA.getTime() - 100 * MIN).toISOString(),
		);

		// E a tela, com a flag ligada, concorda com o worker: sem motivo.
		const avaliacoes = regua.avaliarRegua([fatos], AGORA, () => false, ENV_WEB);
		expect(avaliacoes.get(conversationId)?.motivo).toBeNull();
	});

	it("sem fala nenhuma, a web segue fora com o motivo nomeado", async () => {
		const { conversationId } = await semearWeb("0002", null);
		const [fatos] = await regua.fatosDeConversas([conversationId]);

		expect(fatos.ultimaMensagemDoClienteEm).toBeNull();
		const avaliacoes = regua.avaliarRegua([fatos], AGORA, () => false, ENV_WEB);
		expect(avaliacoes.get(conversationId)?.motivo).toBe("ainda_em_silencio");
	});

	it("no WhatsApp a coluna nova NÃO é preenchida — lá o fato é `last_inbound_at`", async () => {
		const [contact] = await db
			.insert(schema.contacts)
			.values({ phone: `55629${SUF}0003` })
			.returning({ id: schema.contacts.id });
		contactIds.push(contact.id);

		const inbound = new Date(AGORA.getTime() - 100 * MIN);
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: "whatsapp",
				status: "active",
				waId: `55629${SUF}0003`,
				contactId: contact.id,
				lastInboundAt: inbound,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		await db.insert(schema.messages).values({
			conversationId: conv.id,
			role: "user",
			content: "Oi",
			channel: "whatsapp",
			createdAt: inbound,
		});

		const [fatos] = await regua.fatosDeConversas([conv.id]);

		expect(fatos.ultimaMensagemDoClienteEm).toBeNull();
		expect(fatos.lastInboundAt?.toISOString()).toBe(inbound.toISOString());
	});

	it("a linha da régua da conversa continua vindo junto", async () => {
		const { conversationId, contactId } = await semearWeb(
			"0004",
			new Date(AGORA.getTime() - 100 * MIN),
		);
		await db.insert(schema.remarketingTouches).values({
			conversationId,
			contactId,
			objetivo: "carro",
			step: 1,
			status: "ATIVO",
			nextTouchAt: new Date(AGORA.getTime() + MIN),
		});

		const [fatos] = await regua.fatosDeConversas([conversationId]);

		expect(fatos.regua?.step).toBe(1);
		// Quem já está na régua não ganha motivo: o que a tela mostra é o passo.
		const avaliacoes = regua.avaliarRegua([fatos], AGORA, () => false, ENV_WEB);
		expect(avaliacoes.get(conversationId)?.motivo).toBe("ja_na_regua");
		expect(avaliacoes.get(conversationId)?.regua?.status).toBe("ATIVO");
	});
});