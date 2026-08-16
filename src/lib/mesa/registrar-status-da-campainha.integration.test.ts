// O caminho REAL do webhook de status: Meta → banco.
//
// Integração de verdade (Postgres do workspace), porque o que estava quebrado
// não era cálculo: era o fato não existir em lugar nenhum. Um teste com mock de
// `db` provaria que a função chama o ORM, e não que o status vira estado
// consultável — que é a coisa cuja ausência fez o incidente de 14/08 ser lido
// como desatenção da mesa.
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, handoffNotifications } from "@/db/schema";
import { registrarStatusDaCampainha } from "./registrar-status-da-campainha";

const WAMID = "wamid.TESTE_CAMPAINHA_0001";
const SENT = new Date("2026-08-14T22:02:04Z");
const DELIVERED_TS = Math.floor(new Date("2026-08-14T22:44:39Z").getTime() / 1000);

let conversationId: string;

async function criarNotificacao(): Promise<void> {
	const [conv] = await db.insert(conversations).values({ channel: "whatsapp" }).returning();
	conversationId = conv.id;
	await db.insert(handoffNotifications).values({
		conversationId,
		attendantPhone: "5562999990000",
		attendantName: "Atendente de Teste",
		wamid: WAMID,
		listenersNoHandoff: 0,
		sentAt: SENT,
	});
}

beforeEach(async () => {
	await db.delete(handoffNotifications).where(eq(handoffNotifications.wamid, WAMID));
	await criarNotificacao();
});

afterAll(async () => {
	if (conversationId) await db.delete(conversations).where(eq(conversations.id, conversationId));
});

describe("registrarStatusDaCampainha (integração)", () => {
	it("status `delivered` grava o instante que a Meta informou, não o de agora", async () => {
		const r = await registrarStatusDaCampainha({
			id: WAMID,
			status: "delivered",
			timestamp: String(DELIVERED_TS),
		});
		expect(r).toBe("atualizado");

		const [linha] = await db
			.select()
			.from(handoffNotifications)
			.where(eq(handoffNotifications.wamid, WAMID));
		const entregueEm = linha.deliveredAt;
		if (!entregueEm) throw new Error("deliveredAt não foi gravado");
		expect(entregueEm.toISOString()).toBe(new Date(DELIVERED_TS * 1000).toISOString());
		// 42 minutos — o número do incidente real.
		expect(Math.round((entregueEm.getTime() - linha.sentAt.getTime()) / 60_000)).toBe(43);
	});

	it("status de mensagem que não é notificação de handoff é ignorado", async () => {
		const r = await registrarStatusDaCampainha({
			id: "wamid.QUALQUER_OUTRA_MENSAGEM",
			status: "read",
		});
		expect(r).toBe("ignorado");
	});

	it("`read` grava a leitura, e o webhook repetido não sobrescreve o primeiro instante", async () => {
		const primeiro = Math.floor(new Date("2026-08-15T15:26:22Z").getTime() / 1000);
		await registrarStatusDaCampainha({ id: WAMID, status: "read", timestamp: String(primeiro) });
		// A Meta re-entrega webhooks; o segundo não pode mascarar a demora real.
		await registrarStatusDaCampainha({
			id: WAMID,
			status: "read",
			timestamp: String(primeiro + 3600),
		});

		const [linha] = await db
			.select()
			.from(handoffNotifications)
			.where(eq(handoffNotifications.wamid, WAMID));
		expect(linha.readAt?.toISOString()).toBe(new Date(primeiro * 1000).toISOString());
	});

	it("`failed` grava o motivo — é o caso em que o atendente NUNCA foi chamado", async () => {
		await registrarStatusDaCampainha({
			id: WAMID,
			status: "failed",
			errors: [{ code: 131047, title: "Re-engagement message" }],
		});

		const [linha] = await db
			.select()
			.from(handoffNotifications)
			.where(eq(handoffNotifications.wamid, WAMID));
		expect(linha.failedAt).not.toBeNull();
		expect(linha.failureReason).toContain("131047");
	});
});
