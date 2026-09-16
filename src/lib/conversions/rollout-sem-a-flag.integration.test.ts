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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("rollout do contrato V2 — com a flag desligada", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let registry: typeof import("./registry");

	const convIds: string[] = [];
	const flagOriginal = process.env.META_CONVERSION_CONTRACT_V2_ENABLED;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		registry = await import("./registry");
	});

	afterEach(() => {
		if (flagOriginal === undefined) delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		else process.env.META_CONVERSION_CONTRACT_V2_ENABLED = flagOriginal;
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
