// Um lead que SALTA estágios não pode perder o marco do meio.
//
// `applyTrackedStageToLead` aplica de uma vez o estágio MÁXIMO alcançado na
// conversa. Quem informa CPF (vira `qualificado`) e segue conversando até ver
// os grupos reais (vira `em_negociacao`) só ganha a linha de lead depois — e
// entra direto em `em_negociacao`, sem nunca pisar em `qualificado`.
//
// Marcar só o estágio de destino perde justamente o `QualifiedLead`, que é o
// sinal que o Growth pediu para otimizar. O lead qualificou de verdade: deu CPF
// e celular, que é a definição do projeto. O que faltou foi a transição passar
// por lá.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("salto de estágio não perde marco", () => {
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

	async function leadReal() {
		const [visita] = await db
			.insert(schema.visits)
			.values({ visitorId: `salto-${crypto.randomUUID()}`, channel: "web" })
			.returning();
		const [conversa] = await db
			.insert(schema.conversations)
			.values({ visitId: visita.id, channel: "web" })
			.returning();
		convIds.push(conversa.id);
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conversa.id,
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

	it("quem pula de novo para em_negociacao ainda gera QualifiedLead", async () => {
		process.env.META_CONVERSION_CONTRACT_V2_ENABLED = "true";
		const lead = await leadReal();

		// O salto que acontece de verdade: o lead nasce já em `em_negociacao`.
		await registry.registrarConversaoDoEstagio(lead.id, "em_negociacao", undefined, "novo");

		const eventos = await eventosDo(lead.id);
		expect(eventos.map((e) => e.eventName)).toContain("qualified_lead");
	});

	it("não inventa marco que ficou para trás do ponto de partida", async () => {
		process.env.META_CONVERSION_CONTRACT_V2_ENABLED = "true";
		const lead = await leadReal();

		// Já passou por qualificado antes; avançar daqui não pode duplicá-lo.
		await registry.registrarConversaoDoEstagio(lead.id, "qualificado", undefined, "engajado");
		await registry.registrarConversaoDoEstagio(lead.id, "em_negociacao", undefined, "qualificado");

		const eventos = await eventosDo(lead.id);
		expect(eventos.filter((e) => e.eventName === "qualified_lead")).toHaveLength(1);
	});

	// O legado NÃO varre o caminho, e isso é deliberado: ele mapeia
	// `proposta_enviada` e `fechado_ganho`, então inferir por salto inventaria
	// uma proposta entregue e uma venda que ninguém confirmou. O PRD §10 exige
	// entrega verificável e confirmação financeira para esses dois marcos.
	it("o contrato legado marca só o destino — não inventa proposta nem venda", async () => {
		delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		const lead = await leadReal();

		await registry.registrarConversaoDoEstagio(lead.id, "proposta_enviada", undefined, "novo");

		expect((await eventosDo(lead.id)).map((e) => e.eventName)).toEqual(["proposta_criada"]);
	});

	it("sem estágio anterior conhecido, marca só o destino", async () => {
		process.env.META_CONVERSION_CONTRACT_V2_ENABLED = "true";
		const lead = await leadReal();

		await registry.registrarConversaoDoEstagio(lead.id, "qualificado");

		expect((await eventosDo(lead.id)).map((e) => e.eventName)).toEqual(["qualified_lead"]);
	});
});
