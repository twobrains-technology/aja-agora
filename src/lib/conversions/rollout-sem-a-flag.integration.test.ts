// O funil não pode ficar mudo enquanto a flag do contrato V2 está desligada.
//
// O PRD manda publicar com `META_CONVERSION_CONTRACT_V2_ENABLED=false` (§13,
// passo 5) e só ligar depois do aceite em Test Events (passo 7). Entre um
// passo e outro, produção roda com a flag desligada — e o que já funciona hoje
// (lead qualificado e contrato fechado virando sinal pra Meta) tem que
// continuar funcionando. Uma flag de rollout que, desligada, apaga a medição
// atual não é rollout: é apagão com data marcada.
//
// O teste do contrato V2 liga a flag no `beforeEach`, então ele nunca olha
// para este caminho. É por aqui que o buraco aparece.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("rollout do contrato V2 — com a flag desligada", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let registry: typeof import("./registry");

	const convIds: string[] = [];
	const envOriginal = {
		META_CONVERSION_CONTRACT_V2_ENABLED: process.env.META_CONVERSION_CONTRACT_V2_ENABLED,
		CONVERSIONS_API_ENABLED: process.env.CONVERSIONS_API_ENABLED,
		META_PIXEL_ID: process.env.META_PIXEL_ID,
		META_CAPI_ACCESS_TOKEN: process.env.META_CAPI_ACCESS_TOKEN,
	};

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		registry = await import("./registry");
	});

	afterEach(() => {
		for (const [chave, valor] of Object.entries(envOriginal)) {
			if (valor === undefined) delete process.env[chave];
			else process.env[chave] = valor;
		}
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	/** Lead real, com contato e conversa — o caminho que vira sinal pra mídia. */
	async function leadReal() {
		const [visit] = await db
			.insert(schema.visits)
			.values({ visitorId: `rollout-${crypto.randomUUID()}`, channel: "web" })
			.returning();
		const [conv] = await db
			.insert(schema.conversations)
			.values({ visitId: visit.id, channel: "web" })
			.returning();
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				phone: "62988887777",
				email: "cliente@exemplo.com",
				isSimulated: false,
			})
			.returning();
		return lead;
	}

	async function eventosDo(leadId: string) {
		return db
			.select()
			.from(schema.conversionEvents)
			.where(inArray(schema.conversionEvents.leadId, [leadId]));
	}

	/** Roda o despacho com a Meta stubada e devolve os eventos que saíram no corpo. */
	async function despacharCapturando(): Promise<Array<{ event_name: string }>> {
		process.env.CONVERSIONS_API_ENABLED = "true";
		process.env.META_PIXEL_ID = "1360432072874656";
		process.env.META_CAPI_ACCESS_TOKEN = "token-de-teste";
		const enviados: Array<{ event_name: string }> = [];
		vi.stubGlobal("fetch", async (_url: string, init?: { body?: string }) => {
			const corpo = JSON.parse(String(init?.body ?? "{}"));
			enviados.push(...(corpo.data ?? []));
			return new Response(JSON.stringify({ events_received: corpo.data?.length ?? 0 }), {
				status: 200,
			});
		});
		try {
			const dispatch = await import("./dispatch");
			await dispatch.despacharConversoesPendentes();
		} finally {
			vi.unstubAllGlobals();
		}
		return enviados;
	}

	it("a qualificação continua virando sinal — a flag governa o contrato, não o registro", async () => {
		delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		const lead = await leadReal();

		await registry.registrarConversaoDoEstagio(lead.id, "qualificado");

		const eventos = await eventosDo(lead.id);
		expect(eventos).toHaveLength(1);
		expect(eventos[0].eventName).toBe("lead_qualificado");
	});

	it("o contrato fechado continua virando sinal — é a conversão que paga a mídia", async () => {
		delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		const lead = await leadReal();

		await registry.registrarConversaoDoEstagio(lead.id, "fechado_ganho", undefined, "qualificado");

		const eventos = await eventosDo(lead.id);
		expect(eventos).toHaveLength(1);
		expect(eventos[0].eventName).toBe("contrato_fechado");
	});

	it("repetir a transição não duplica o sinal, com a flag desligada também", async () => {
		delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		const lead = await leadReal();

		await registry.registrarConversaoDoEstagio(lead.id, "qualificado");
		await registry.registrarConversaoDoEstagio(lead.id, "qualificado");

		expect(await eventosDo(lead.id)).toHaveLength(1);
	});

	it("ligada a flag, o mesmo estágio passa a gravar o nome V2 — e só ele", async () => {
		process.env.META_CONVERSION_CONTRACT_V2_ENABLED = "true";
		const lead = await leadReal();

		await registry.registrarConversaoDoEstagio(lead.id, "qualificado");

		const eventos = await eventosDo(lead.id);
		expect(eventos).toHaveLength(1);
		expect(eventos[0].eventName).toBe("qualified_lead");
	});

	it("o marco legado pendente ainda é ENVIADO à Meta — gravar sem enviar é o mesmo apagão um passo à frente", async () => {
		delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		const lead = await leadReal();
		await registry.registrarConversao({ leadId: lead.id, eventName: "contrato_fechado" });

		const enviados = await despacharCapturando();

		expect(enviados.map((e) => e.event_name)).toContain("Purchase");
		const [evento] = await eventosDo(lead.id);
		expect(evento.status).toBe("sent");
	});

	it("o ChatOpened continua fora da fila comercial — é ele que gera os HTTP 400", async () => {
		delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		const lead = await leadReal();
		await db.insert(schema.conversionEvents).values({
			leadId: lead.id,
			conversationId: lead.conversationId,
			eventName: "chat_iniciado",
			destination: "meta",
			eventKey: `${lead.id}:chat_iniciado`,
			occurredAt: new Date(),
			currency: "BRL",
			actionSource: "website",
		});

		const enviados = await despacharCapturando();

		const nomes = enviados.map((e) => e.event_name);
		expect(nomes).not.toContain("ChatIniciado");
		expect(nomes).not.toContain("chat_iniciado");
		const [evento] = await eventosDo(lead.id);
		expect(evento.status).toBe("skipped");
	});

	it("o lead simulado continua de fora nos dois contratos", async () => {
		delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		const [visit] = await db
			.insert(schema.visits)
			.values({ visitorId: `rollout-sim-${crypto.randomUUID()}`, channel: "web" })
			.returning();
		const [conv] = await db
			.insert(schema.conversations)
			.values({ visitId: visit.id, channel: "web" })
			.returning();
		convIds.push(conv.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: conv.id, phone: "62988887777", isSimulated: true })
			.returning();

		await registry.registrarConversaoDoEstagio(lead.id, "qualificado");

		expect(await eventosDo(lead.id)).toHaveLength(0);
	});
});
