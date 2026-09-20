// F2 / AJA-02 (corrida do `last_inbound_at`) — a conversa nasce JÁ com o inbound.
//
// Medido em produção (diagnóstico §c): `updateLastInboundAt` roda fire-and-forget
// ANTES da conversa existir, na primeira mensagem de um número novo. A busca por
// `wa_id` não acha nada, loga "No conversation found" e desiste — e se a pessoa
// nunca manda uma segunda mensagem, `last_inbound_at` fica NULL PARA SEMPRE.
// 4/4 conversas com exatamente 1 mensagem na janela; 0/8 nas com 2+.
//
// Isso não é cosmético: a régua de remarketing exige `last_inbound_at IS NOT NULL`
// (`remarketing-cycle.ts`), então todo lead de primeira mensagem ficava fora.
//
// Integração com banco real, e na ORDEM da produção (o update antes da criação).
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// `SIM-` isola o teste: sem conversão de mídia nem resolução de contato no
// caminho (o que está sob teste é a coluna, não o funil). Único por execução
// porque o Postgres é compartilhado entre os agentes.
const SUFIXO = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
const WA_ID = `SIM-f2-lastinbound-${SUFIXO}`;

describeIfDb("F2 — a conversa WhatsApp nasce com lastInboundAt (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let getOrCreateConversation: typeof import("./session").getOrCreateConversation;
	let updateLastInboundAt: typeof import("@/app/actions/whatsapp").updateLastInboundAt;

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ getOrCreateConversation } = await import("./session"));
		({ updateLastInboundAt } = await import("@/app/actions/whatsapp"));
		await cleanup();
	});

	afterAll(async () => {
		await cleanup();
	});

	async function cleanup() {
		if (!convIds.length) return;
		await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
		await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		convIds.length = 0;
	}

	async function ler(convId: string) {
		const conv = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, convId),
			columns: { lastInboundAt: true },
		});
		return conv?.lastInboundAt ?? null;
	}

	it("primeira mensagem de um número novo: a conversa criada tem lastInboundAt", async () => {
		// A ORDEM DA PRODUÇÃO: o webhook atualiza o inbound ANTES de o processador
		// criar a conversa. É exatamente aqui que o update se perdia.
		await updateLastInboundAt(WA_ID, "msg-f2-1");

		const { id, isNew } = await getOrCreateConversation(WA_ID);
		convIds.push(id);

		expect(isNew).toBe(true);
		const lastInboundAt = await ler(id);
		expect(lastInboundAt).not.toBeNull();
		// O instante é o da criação, não uma data arbitrária.
		expect(Math.abs(Date.now() - (lastInboundAt?.getTime() ?? 0))).toBeLessThan(60_000);
	});

	it("a segunda chamada não recria nem reescreve o inbound", async () => {
		const primeira = await getOrCreateConversation(WA_ID);
		if (!convIds.includes(primeira.id)) convIds.push(primeira.id);
		const antes = await ler(primeira.id);

		const segunda = await getOrCreateConversation(WA_ID);

		expect(segunda.id).toBe(primeira.id);
		expect(segunda.isNew).toBe(false);
		expect((await ler(primeira.id))?.getTime()).toBe(antes?.getTime());
	});
});
