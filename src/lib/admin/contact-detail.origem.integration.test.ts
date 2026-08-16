// De qual campanha o CLIENTE veio — na visão consolidada do contato.
//
// O card do kanban abre este painel sempre que o lead tem `contactId`, que é o
// caso comum (o mesmo cliente em web + WhatsApp vira um card só). Sem a origem
// aqui, "de onde veio esse cliente?" continuava sem resposta na tela onde ela é
// olhada.
//
// A escolha que este teste fixa: entre várias conversas do mesmo contato, vale
// a PRIMEIRA que trouxe campanha. É o anúncio que trouxe o cliente para dentro;
// a chegada direta posterior não apaga o que a mídia pagou.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("getContactDetail — origem do cliente", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let getContactDetail: typeof import("./contact-detail").getContactDetail;

	const contactIds: string[] = [];
	const convIds: string[] = [];
	const visitIds: string[] = [];

	async function semearContato(
		visitas: Array<{ utmSource?: string; utmCampaign?: string; quando: Date }>,
	): Promise<string> {
		const [contato] = await db
			.insert(schema.contacts)
			.values({ phone: `6299${Math.floor(Math.random() * 1e7)}`, name: "Cliente Origem" })
			.returning({ id: schema.contacts.id });
		contactIds.push(contato.id);

		for (const v of visitas) {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: `c-${crypto.randomUUID()}`,
					channel: "web",
					createdAt: v.quando,
					utmSource: v.utmSource ?? null,
					utmCampaign: v.utmCampaign ?? null,
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);

			const [conversa] = await db
				.insert(schema.conversations)
				.values({
					channel: "web",
					status: "active",
					contactId: contato.id,
					visitId: visita.id,
					createdAt: v.quando,
					updatedAt: v.quando,
					metadata: {},
				})
				.returning({ id: schema.conversations.id });
			convIds.push(conversa.id);
		}
		return contato.id;
	}

	let idComCampanha: string;
	let idSoDireto: string;
	let idSemVisita: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ getContactDetail } = await import("./contact-detail"));

		// Chegou pelo anúncio e voltou direto depois — o anúncio é quem o trouxe.
		idComCampanha = await semearContato([
			{ quando: new Date("2019-07-01T10:00:00Z"), utmSource: "ig", utmCampaign: "consorcio-julho" },
			{ quando: new Date("2019-07-20T10:00:00Z") },
		]);

		// Só chegadas diretas.
		idSoDireto = await semearContato([{ quando: new Date("2019-07-05T10:00:00Z") }]);

		// Conversa sem visita (WhatsApp orgânico).
		const [contato] = await db
			.insert(schema.contacts)
			.values({ phone: `6299${Math.floor(Math.random() * 1e7)}`, name: "Sem Visita" })
			.returning({ id: schema.contacts.id });
		contactIds.push(contato.id);
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "whatsapp", status: "active", contactId: contato.id, metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		idSemVisita = contato.id;
	});

	afterAll(async () => {
		if (convIds.length > 0)
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		if (visitIds.length > 0)
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		if (contactIds.length > 0)
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
	});

	it("mostra a campanha que trouxe o cliente, não a volta direta depois", async () => {
		const detalhe = await getContactDetail(idComCampanha);
		expect(detalhe?.origem).toMatchObject({
			tipo: "campanha",
			fonte: "ig",
			campanha: "consorcio-julho",
		});
	});

	it("diz 'direto' quando houve visita mas nunca campanha", async () => {
		const detalhe = await getContactDetail(idSoDireto);
		expect(detalhe?.origem).toMatchObject({ tipo: "direto" });
	});

	it("devolve null quando nenhuma conversa nasceu de visita", async () => {
		// Não é "direto": é chegada que ninguém mediu. Rotular como direta
		// afirmaria uma passagem pela landing que não aconteceu.
		const detalhe = await getContactDetail(idSemVisita);
		expect(detalhe?.origem ?? null).toBeNull();
	});
});
