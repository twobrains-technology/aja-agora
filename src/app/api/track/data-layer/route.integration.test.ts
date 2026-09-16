// O event_id do navegador tem que ser o MESMO que vai pela CAPI.
//
// A Meta deduplica Pixel × CAPI pelo par `event_name` + `event_id`. Se os dois
// lados usarem ids diferentes, o mesmo fato vira duas conversões — e o sintoma
// é uma métrica que SOBE, que é o tipo de defeito que ninguém investiga. Por
// isso a chave sai de `conversion_events`, e este teste é o que amarra os dois
// lados: o valor devolvido ao browser é comparado com o `event_key` gravado.
//
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("marcos da conversa para o dataLayer", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let rota: typeof import("./route");

	const convIds: string[] = [];
	const flagOriginal = process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
	let conversaId = "";
	let leadId = "";
	const proposta = `PROP-dl-${crypto.randomUUID()}`;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		rota = await import("./route");
		process.env.META_CONVERSION_CONTRACT_V2_ENABLED = "true";

		const [visita] = await db
			.insert(schema.visits)
			.values({ visitorId: `dl-${crypto.randomUUID()}`, channel: "web" })
			.returning();
		const [conversa] = await db
			.insert(schema.conversations)
			.values({ visitId: visita.id, channel: "web" })
			.returning();
		convIds.push(conversa.id);
		conversaId = conversa.id;
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conversa.id,
				phone: "62988887777",
				email: "cliente@exemplo.com",
				creditValue: "150000.00",
				isSimulated: false,
			})
			.returning();
		leadId = lead.id;
		await db.insert(schema.beviProposals).values({
			conversationId: conversa.id,
			leadId: lead.id,
			proposalId: proposta,
			segmento: "imovel",
			creditValue: "150000.00",
		});

		const registry = await import("@/lib/conversions/registry");
		await registry.registrarInicioDeConversaReal(conversa.id);
		await registry.registrarLeadIdentificado(conversa.id);
		await registry.registrarCompraConfirmada(lead.id, proposta, `SALE-${proposta}`);
	});

	afterAll(async () => {
		if (flagOriginal === undefined) delete process.env.META_CONVERSION_CONTRACT_V2_ENABLED;
		else process.env.META_CONVERSION_CONTRACT_V2_ENABLED = flagOriginal;
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	it("devolve o MESMO event_id que foi gravado para a CAPI", async () => {
		const marcos = await rota.marcosDaConversa(conversaId);
		const gravados = await db
			.select()
			.from(schema.conversionEvents)
			.where(eq(schema.conversionEvents.leadId, leadId));

		for (const gravado of gravados) {
			const noBrowser = marcos.find((m) => m.event === gravado.eventName);
			expect(noBrowser?.event_id).toBe(gravado.eventKey);
		}
	});

	it("traz a jornada da conversa, inclusive o marco que só tem conversa", async () => {
		const marcos = await rota.marcosDaConversa(conversaId);

		expect(marcos.map((m) => m.event)).toEqual(["conversation_started", "lead", "purchase"]);
		expect(marcos.every((m) => m.journey_stage === m.event)).toBe(true);
	});

	it("a venda leva transaction_id, value e currency; os outros marcos não", async () => {
		const marcos = await rota.marcosDaConversa(conversaId);
		const compra = marcos.find((m) => m.event === "purchase");
		const lead = marcos.find((m) => m.event === "lead");

		expect(compra).toMatchObject({ value: 150000, currency: "BRL" });
		expect(compra?.transaction_id).toBe(`SALE-${proposta}`);
		expect(lead?.value).toBeUndefined();
		expect(lead?.transaction_id).toBeUndefined();
	});

	it("não vaza PII — isto vai para o dataLayer, que qualquer script da página lê", async () => {
		const marcos = await rota.marcosDaConversa(conversaId);
		const serializado = JSON.stringify(marcos);

		expect(serializado).not.toContain("cliente@exemplo.com");
		expect(serializado).not.toContain("62988887777");
	});

	it("conversa sem marco nenhum devolve lista vazia, não erro", async () => {
		expect(await rota.marcosDaConversa(crypto.randomUUID())).toEqual([]);
	});
});
