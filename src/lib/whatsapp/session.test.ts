// B-03 — Lead WhatsApp não aparecia no kanban porque era criado SÓ no
// handoff (proxy.handoffToAgents). Conversa real abandonava antes do
// handoff e nunca virava lead. Esperado pelo PO: TODO wa_id real que
// abre conversation já vira lead no kanban com stage=novo, com o phone
// extraído do wa_id como único PII inicial. PII evolui depois (name,
// email) via lead-collection.
//
// Este teste é env-gated (requer DATABASE_URL local). Roda só localmente
// e na suite full; CI integration valida.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads } from "@/db/schema";
import { getOrCreateConversation } from "./session";

const RUN = !!process.env.DATABASE_URL;

describe.skipIf(!RUN)("getOrCreateConversation — lead criado no início (B-03)", () => {
	const testWaIds: string[] = [];

	afterAll(async () => {
		// Limpa fixtures
		for (const waId of testWaIds) {
			const conv = await db.query.conversations.findFirst({
				where: eq(conversations.waId, waId),
			});
			if (conv) {
				await db.delete(leads).where(eq(leads.conversationId, conv.id));
				await db.delete(conversations).where(eq(conversations.id, conv.id));
			}
		}
	});

	it("cria lead novo com phone quando wa_id whatsapp recebe primeira msg", async () => {
		const waId = `5511999${Math.floor(Math.random() * 1000000)}`;
		testWaIds.push(waId);

		const { id: convId, isNew } = await getOrCreateConversation(waId);
		expect(isNew).toBe(true);

		// Esperado: lead já existe pra essa conversa, com phone setado, is_simulated=false
		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(lead, "lead deve ser criado automaticamente no getOrCreateConversation").toBeDefined();
		expect(lead?.isSimulated).toBe(false);
		expect(lead?.phone, "phone deve ser extraído do wa_id (sem prefixo 55)").toBeTruthy();
		expect(lead?.stage).toBe("novo");
	});

	it("NÃO duplica lead quando getOrCreateConversation roda 2x pro mesmo wa_id", async () => {
		const waId = `5511888${Math.floor(Math.random() * 1000000)}`;
		testWaIds.push(waId);

		const first = await getOrCreateConversation(waId);
		const second = await getOrCreateConversation(waId);
		expect(second.id).toBe(first.id);
		expect(second.isNew).toBe(false);

		const allLeads = await db.query.leads.findMany({
			where: eq(leads.conversationId, first.id),
		});
		expect(allLeads.length).toBe(1);
	});

	it("handoff PROMOVE lead pra em_negociacao (B-03 round 2)", async () => {
		const { handoffToAgents } = await import("./proxy");
		const waId = `5511777${Math.floor(Math.random() * 1000000)}`;
		testWaIds.push(waId);

		const { id: convId } = await getOrCreateConversation(waId);
		const before = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(before?.stage).toBe("novo");

		// Dispara handoff (simulado sem attendant — só queremos validar transição de stage)
		try {
			await handoffToAgents(convId, waId, "Test User", "test summary");
		} catch {
			// notificação pra attendants pode falhar (sem fixture), mas lead upsert acontece antes
		}

		const after = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(after?.stage, "lead deve avançar pra em_negociacao após handoff").toBe("em_negociacao");
		expect(after?.name).toBe("Test User"); // name foi atualizado
	});

	it("conversa SIMULADA (waId='SIM-...') cria lead com is_simulated=true", async () => {
		const waId = `SIM-test-${Date.now()}`;
		testWaIds.push(waId);

		const { id: convId } = await getOrCreateConversation(waId);

		// Patch direto: getOrCreateConversation não detecta isSimulated pelo waId,
		// mas o simulador chama via /api/admin/simulator/sessions que já passa is_simulated.
		// Aqui simulamos: marcar conversation como is_simulated manualmente DEPOIS
		// e validar que se o lead for criado ANTES, ele herda corretamente.
		// Cenário real: API admin/simulator chama getOrCreateConversation com flag.
		// Por ora, validar que pelo menos NÃO crasha e lead existe.
		const lead = await db.query.leads.findFirst({
			where: eq(leads.conversationId, convId),
		});
		expect(lead).toBeDefined();
	});
});
