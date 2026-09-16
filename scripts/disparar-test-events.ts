#!/usr/bin/env tsx
/**
 * Dispara a jornada completa do contrato V2 no Test Events da Meta.
 *
 * Por que fora de produção: os gatilhos V2 só gravam com
 * `META_CONVERSION_CONTRACT_V2_ENABLED=true`, e a flag de produção tem que
 * continuar desligada até o aceite do Growth. Então a jornada é semeada num
 * banco local e enviada ao MESMO dataset com `test_event_code` — o Events
 * Manager mostra tudo na aba Test Events sem que nada entre nos relatórios nem
 * no banco de produção.
 *
 * Um único lead percorre os seis marcos na ordem, para que a jornada possa ser
 * validada de ponta a ponta:
 *
 *   ConversationStarted → Lead → QualifiedLead → OfferViewed → ProposalSent → Purchase
 *
 * Uso:
 *   META_CAPI_TEST_EVENT_CODE=TEST32550 \
 *   META_PIXEL_ID=... META_CAPI_ACCESS_TOKEN=... \
 *   pnpm tsx scripts/disparar-test-events.ts
 */

import { eq, inArray } from "drizzle-orm";

const TEST_CODE = process.env.META_CAPI_TEST_EVENT_CODE;
if (!TEST_CODE) throw new Error("META_CAPI_TEST_EVENT_CODE é obrigatório (ex.: TEST32550)");
if (!process.env.META_PIXEL_ID || !process.env.META_CAPI_ACCESS_TOKEN)
	throw new Error("META_PIXEL_ID e META_CAPI_ACCESS_TOKEN são obrigatórios");

// Os gatilhos V2 só gravam com o contrato ligado. Isto vale para ESTE processo,
// não para produção.
process.env.META_CONVERSION_CONTRACT_V2_ENABLED = "true";
process.env.CONVERSIONS_API_ENABLED = "true";

const marca = `test-events-${Date.now()}`;

type Db = Awaited<ReturnType<typeof carregar>>;

async function carregar() {
	const { db } = await import("@/db");
	const schema = await import("@/db/schema");
	const registry = await import("@/lib/conversions/registry");
	const dispatch = await import("@/lib/conversions/dispatch");
	const { montarPayload } = await import("@/lib/conversions/meta-capi");
	const { getConversionsConfig } = await import("@/lib/conversions/config");
	return { db, schema, registry, dispatch, montarPayload, getConversionsConfig };
}

async function semear(db: Db["db"], schema: Db["schema"]) {
	const [visita] = await db
		.insert(schema.visits)
		.values({
			visitorId: marca,
			channel: "web",
			landingPath: "/",
			utmSource: "facebook",
			utmMedium: "paid",
			utmCampaign: "validacao-growth",
			utmContent: "criativo-teste",
			campaignId: "1200000000000000",
			adsetId: "1300000000000000",
			adId: "1400000000000000",
			fbclid: `IwAR-${marca}`,
			fbp: `fb.1.${Date.now()}.1234567890`,
		})
		.returning();

	const [conversa] = await db
		.insert(schema.conversations)
		.values({ visitId: visita.id, channel: "web", isSimulated: false })
		.returning();

	const [lead] = await db
		.insert(schema.leads)
		.values({
			conversationId: conversa.id,
			name: "Lead de Validação Growth",
			email: "validacao.growth@ajaagora.com.br",
			phone: "62999990000",
			creditValue: "150000.00",
			stage: "qualificado",
			isSimulated: false,
		})
		.returning();

	const proposalId = `PROP-${marca}`;
	await db.insert(schema.beviProposals).values({
		conversationId: conversa.id,
		leadId: lead.id,
		proposalId,
		segmento: "imovel",
		administradora: "Bevi",
		creditValue: "150000.00",
		monthlyPayment: "980.00",
		termMonths: 200,
	});

	return { visita, conversa, lead, proposalId };
}

async function main() {
	const { db, schema, registry, dispatch, montarPayload, getConversionsConfig } = await carregar();
	console.log(`\n▸ Semeando a jornada (marca ${marca})…`);
	const { conversa, lead, proposalId } = await semear(db, schema);
	console.log(`  lead ${lead.id}`);
	console.log(`  conversa ${conversa.id}`);
	console.log(`  proposta ${proposalId}\n`);

	// A ordem importa: é a jornada que o Growth vai conferir no Events Manager.
	// `occurredAt` crescente para que a sequência apareça na ordem certa lá.
	const t0 = Date.now() - 6 * 60_000;
	const em = (min: number) => new Date(t0 + min * 60_000);

	console.log("▸ Disparando os seis marcos na ordem…");
	await registry.registrarInicioDeConversaReal(conversa.id, em(0));
	console.log("  1/6 ConversationStarted");
	await registry.registrarLeadIdentificado(conversa.id, em(1));
	console.log("  2/6 Lead");
	await registry.registrarConversaoDoEstagio(lead.id, "qualificado", em(2), "engajado");
	console.log("  3/6 QualifiedLead");
	await registry.registrarOfertaExibida(lead.id, proposalId);
	console.log("  4/6 OfferViewed");
	await registry.registrarPropostaEnviada(lead.id, proposalId);
	console.log("  5/6 ProposalSent");
	await registry.registrarCompraConfirmada(lead.id, proposalId, `SALE-${marca}`);
	console.log("  6/6 Purchase\n");

	const gravados = await db
		.select()
		.from(schema.conversionEvents)
		.where(eq(schema.conversionEvents.leadId, lead.id));
	const daConversa = await db
		.select()
		.from(schema.conversionEvents)
		.where(eq(schema.conversionEvents.conversationId, conversa.id));
	const todos = [...gravados, ...daConversa.filter((e) => !gravados.some((g) => g.id === e.id))];

	console.log(`▸ Gravados no banco local: ${todos.length}/6`);
	for (const e of todos.sort((a, b) => +a.occurredAt - +b.occurredAt)) {
		console.log(
			`  ${e.eventName.padEnd(20)} key=${e.eventKey}  value=${e.value ?? "—"} ${e.currency}`,
		);
	}
	if (todos.length !== 6) {
		console.error("\n✗ Nem todos os marcos foram gravados — abortando o envio.");
		process.exit(1);
	}

	// Mostra o payload real antes de enviar: é a evidência que o Growth confere.
	const cfg = getConversionsConfig();
	const payload = montarPayload(
		todos.map((linha) => ({
			id: linha.id,
			eventName: linha.eventName,
			eventKey: linha.eventKey,
			occurredAt: linha.occurredAt,
			value: linha.value,
			currency: linha.currency,
			hashedEmail: linha.hashedEmail,
			hashedPhone: linha.hashedPhone,
			externalId: linha.externalId,
			fbc: linha.fbc,
			fbp: linha.fbp,
			ctwaClid: linha.ctwaClid,
			clientUserAgent: linha.clientUserAgent,
			actionSource: linha.actionSource,
			contentId: linha.contentId,
			campaignId: linha.campaignId,
			adsetId: linha.adsetId,
			adId: linha.adId,
			previousStage: linha.previousStage,
			currentStage: linha.currentStage,
			proposalId: linha.proposalId,
			saleId: linha.saleId,
		})),
		cfg,
	);
	console.log(`\n▸ Payload que vai para o dataset ${cfg.pixelId} (test_event_code=${TEST_CODE}):`);
	console.log(JSON.stringify(payload, null, 2));

	console.log("\n▸ Enviando…");
	const resultado = await dispatch.despacharConversoesPendentes();
	console.log(`  enviados=${resultado.enviados} falhas=${resultado.falhas}`);
	if (resultado.desligado) console.log(`  desligado: ${resultado.desligado}`);

	const depois = await db
		.select()
		.from(schema.conversionEvents)
		.where(
			inArray(
				schema.conversionEvents.id,
				todos.map((e) => e.id),
			),
		);
	console.log("\n▸ Status final de cada marco:");
	for (const e of depois.sort((a, b) => +a.occurredAt - +b.occurredAt)) {
		console.log(`  ${e.eventName.padEnd(20)} ${e.status}${e.lastError ? ` — ${e.lastError}` : ""}`);
	}

	const falhou = depois.filter((e) => e.status !== "sent");
	if (falhou.length) {
		console.error(`\n✗ ${falhou.length} marco(s) não foram aceitos.`);
		process.exit(1);
	}
	console.log(`\n✓ Os seis marcos foram aceitos pela Meta em ${TEST_CODE}.`);
	console.log("  Events Manager › Test Events › selecionar o código para ver a jornada.");
	process.exit(0);
}

main().catch((erro) => {
	console.error(erro);
	process.exit(1);
});
