// A3 (integration-db) — a conversa de WhatsApp que nasceu de um toque no site
// aponta para a MESMA visita que originou o toque.
//
// Contra Postgres de verdade, e não com repositório fingido, porque o que este
// caminho tem de frágil é justamente o que mock não exercita: o índice de
// expressão `left(id::text, 8)`, o filtro parcial por canal, a chave
// estrangeira `conversations.visit_id → visits.id` e o guard `visit_id IS NULL`
// que impede um código antigo de reescrever origem já gravada.
//
// **O que este teste vale.** Medido em produção em 30/08/2026, na janela de
// 18–30/08: 86 toques no botão flutuante do WhatsApp, 58 visitantes distintos,
// 6 conversas de WhatsApp nascidas — e as 6 com `visit_id` NULO. Cem por cento
// do tráfego que sai pelo botão sumia da conta, e é sobre essa conta que a
// planilha calculou o `%Conv Chat = 1,68%` que sustenta o modelo de
// investimento inteiro. É este teste que prova que o buraco fechou.
//
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { carimbarOrigem, codigoDaVisita, extrairCodigoDeOrigem } from "./codigo-de-origem";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("A3 — origem do site sobrevive ao salto para o WhatsApp (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let resolverVisitaPorCodigo: typeof import("./visit-store").resolverVisitaPorCodigo;
	let vincularVisitaDoSite: typeof import("@/lib/whatsapp/vinculo-com-o-site").vincularVisitaDoSite;

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const waIds: string[] = [];

	const marcarVisita = (id: string) => {
		visitIds.push(id);
		return id;
	};
	const novoWaId = () => {
		const wa = `5511${Math.floor(100000000 + Math.random() * 899999999)}`;
		waIds.push(wa);
		return wa;
	};

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ resolverVisitaPorCodigo } = await import("./visit-store"));
		({ vincularVisitaDoSite } = await import("@/lib/whatsapp/vinculo-com-o-site"));
	});

	afterAll(async () => {
		if (waIds.length > 0) {
			const convs = await db
				.select({ id: schema.conversations.id })
				.from(schema.conversations)
				.where(inArray(schema.conversations.waId, waIds));
			convIds.push(...convs.map((c) => c.id));
		}
		if (convIds.length > 0) {
			await db
				.delete(schema.conversionEvents)
				.where(inArray(schema.conversionEvents.conversationId, convIds));
			await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	/** Uma visita web como o proxy grava, com origem de campanha dentro. */
	async function visitaDoSite(overrides: Partial<typeof schema.visits.$inferInsert> = {}) {
		const [v] = await db
			.insert(schema.visits)
			.values({
				visitorId: `uid-${crypto.randomUUID().slice(0, 12)}`,
				channel: "web",
				landingPath: "/",
				utmSource: "facebook",
				utmMedium: "cpc",
				utmCampaign: "bofu-carro-agosto",
				fbclid: "IwAR-teste-a3",
				fbp: "fb.1.1700000000000.1234567890",
				userAgent: "Mozilla/5.0 (iPhone)",
				...overrides,
			})
			.returning({ id: schema.visits.id });
		return marcarVisita(v.id);
	}

	it("o código volta para a visita que o gerou", async () => {
		const visitId = await visitaDoSite();
		const codigo = codigoDaVisita(visitId);
		expect(codigo).not.toBeNull();

		expect(await resolverVisitaPorCodigo(codigo as string)).toBe(visitId);
	});

	it("a jornada inteira: toque no botão → fala carimbada → conversa com origem", async () => {
		const visitId = await visitaDoSite();
		const waId = novoWaId();

		// 1) O botão flutuante monta a fala com o carimbo.
		const fala = carimbarOrigem("Oi! Quero comparar consórcios.", codigoDaVisita(visitId));
		expect(fala).toContain("(ref ");

		// 2) A mensagem chega no webhook e o código é lido dela.
		const codigo = extrairCodigoDeOrigem(fala);
		expect(codigo).toBe(codigoDaVisita(visitId));

		// 3) O webhook amarra a conversa à visita ANTES do primeiro turno.
		const conversationId = await vincularVisitaDoSite(waId, codigo as string);
		expect(conversationId).not.toBeNull();

		const conversa = await db.query.conversations.findFirst({
			where: eq(schema.conversations.waId, waId),
		});
		expect(conversa?.visitId).toBe(visitId);
		expect(conversa?.channel).toBe("whatsapp");
	});

	it("a conversa passa a carregar a CAMPANHA — que é o ponto do item", async () => {
		// Não basta ter `visit_id`: quem lê isso é `registrarConversao`, para montar
		// `fbc`/`fbp` do evento de CAPI e para o relatório dizer qual anúncio pagou
		// por esta venda.
		const visitId = await visitaDoSite({ utmCampaign: "rmkt-imovel", fbclid: "IwAR-rmkt" });
		const waId = novoWaId();

		await vincularVisitaDoSite(waId, codigoDaVisita(visitId) as string);

		const [linha] = await db
			.select({
				campanha: schema.visits.utmCampaign,
				fbclid: schema.visits.fbclid,
				fbp: schema.visits.fbp,
			})
			.from(schema.conversations)
			.innerJoin(schema.visits, eq(schema.visits.id, schema.conversations.visitId))
			.where(eq(schema.conversations.waId, waId));

		expect(linha.campanha).toBe("rmkt-imovel");
		expect(linha.fbclid).toBe("IwAR-rmkt");
		expect(linha.fbp).toBe("fb.1.1700000000000.1234567890");
	});

	it("origem já gravada NÃO é reescrita por um código colado depois", async () => {
		// O caso real: quem veio de um anúncio Click-to-WhatsApp e depois cola uma
		// fala antiga do site. Origem gravada é fato; código no texto é pista, e
		// pista não derruba fato.
		const doAnuncio = await visitaDoSite({ channel: "whatsapp", utmCampaign: "ctwa-original" });
		const doSite = await visitaDoSite({ utmCampaign: "site-colado" });
		const waId = novoWaId();

		const [conv] = await db
			.insert(schema.conversations)
			.values({ waId, channel: "whatsapp", visitId: doAnuncio })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		const resultado = await vincularVisitaDoSite(waId, codigoDaVisita(doSite) as string);
		expect(resultado).toBeNull();

		const conversa = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, conv.id),
		});
		expect(conversa?.visitId).toBe(doAnuncio);
	});

	it("o EVENTO de mídia também nasce com a origem — não só a conversa", async () => {
		// O furo que a revisão pegou: `getOrCreateConversation` dispara o
		// `chat_iniciado` (item B3) na criação, e ele é idempotente pela chave. Com
		// o vínculo acontecendo DEPOIS, o sinal que ensina a campanha saía sem
		// `fbc`, sem `fbp` e sem visita — justamente para o tráfego que este
		// arquivo existe para recuperar. `%Conv Chat` consertava; a otimização,
		// não.
		const visitId = await visitaDoSite({ utmCampaign: "bofu-imovel", fbclid: "IwAR-b3-site" });
		const waId = novoWaId();

		await vincularVisitaDoSite(waId, codigoDaVisita(visitId) as string);

		const [evento] = await db
			.select({
				visitId: schema.conversionEvents.visitId,
				fbc: schema.conversionEvents.fbc,
				fbp: schema.conversionEvents.fbp,
				nome: schema.conversionEvents.eventName,
			})
			.from(schema.conversionEvents)
			.innerJoin(
				schema.conversations,
				eq(schema.conversations.id, schema.conversionEvents.conversationId),
			)
			.where(eq(schema.conversations.waId, waId));

		expect(evento?.nome).toBe("chat_iniciado");
		expect(evento?.visitId).toBe(visitId);
		expect(evento?.fbc).toContain("IwAR-b3-site");
		expect(evento?.fbp).toBe("fb.1.1700000000000.1234567890");
	});

	it("código que não existe não inventa origem nem derruba a conversa", async () => {
		const waId = novoWaId();
		expect(await vincularVisitaDoSite(waId, "deadbeef")).toBeNull();
	});

	it("visita de mais de 24h não é reivindicada", async () => {
		// Passou disso, a chegada é OUTRA — amarrá-la à visita antiga daria crédito
		// ao criativo errado.
		const antiga = await visitaDoSite();
		await db
			.update(schema.visits)
			.set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
			.where(eq(schema.visits.id, antiga));

		expect(await resolverVisitaPorCodigo(codigoDaVisita(antiga) as string)).toBeNull();
	});

	it("a resolução ignora visita que não é do site", async () => {
		// O código nasce no site. Aceitar canal `whatsapp` aqui deixaria uma
		// conversa de WhatsApp reivindicar a visita de outra conversa de WhatsApp.
		const doWhatsapp = await visitaDoSite({ channel: "whatsapp" });
		expect(await resolverVisitaPorCodigo(codigoDaVisita(doWhatsapp) as string)).toBeNull();
	});
});
