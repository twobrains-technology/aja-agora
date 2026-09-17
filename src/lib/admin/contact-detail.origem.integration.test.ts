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
import { semearCache, serializarChave } from "@/lib/meta-ads/resolver";

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
		visitas: Array<{ utmSource?: string; utmCampaign?: string; campaignId?: string; quando: Date }>,
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
					campaignId: v.campaignId ?? null,
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
	let idComNomeResolvido: string;

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

		// Chegou com o `campaign_id` da Meta e o espelho local sincronizado: é o
		// id da própria Meta, não texto que alguém digitou na UTM.
		const ID_RESOLVIDO = "120250956902860104";
		semearCache([
			[
				serializarChave({ tipo: "campaign_id", valor: ID_RESOLVIDO }),
				{
					nome: "META | EXP | LEAD | BR",
					entityId: ID_RESOLVIDO,
					origemDaResolucao: "id",
					status: "ACTIVE",
				},
			],
		]);
		idComNomeResolvido = await semearContato([
			{ quando: new Date("2019-07-08T10:00:00Z"), utmSource: "ig", campaignId: ID_RESOLVIDO },
		]);

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
		// Cache do resolvedor é global: sem limpar, vazaria para o resto do worker.
		semearCache([]);
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

	it("resolve o NOME real da campanha pelo campaign_id da visita", async () => {
		// O `visit: true` do `getContactDetail` precisa incluir o `campaign_id`: é
		// ele que resolve o nome no espelho local. Enxugar o select derrubaria a
		// resolução em silêncio e o painel voltaria ao sufixo de seis dígitos — que
		// casa com duas campanhas diferentes.
		const detalhe = await getContactDetail(idComNomeResolvido);

		expect(detalhe?.origem?.nomeDaCampanha).toBe("META | EXP | LEAD | BR");
		expect(detalhe?.origem?.entityId).toBe("120250956902860104");
	});

	it("devolve null quando nenhuma conversa nasceu de visita", async () => {
		// Não é "direto": é chegada que ninguém mediu. Rotular como direta
		// afirmaria uma passagem pela landing que não aconteceu.
		const detalhe = await getContactDetail(idSemVisita);
		expect(detalhe?.origem ?? null).toBeNull();
	});
});
