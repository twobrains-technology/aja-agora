// B3 (integration-db) — o início de conversa existe do lado do servidor, com
// deduplicação contra o pixel e sem virar conversão de negócio.
//
// Contra Postgres real porque o que este caminho tem de frágil é do banco: o
// valor novo no enum `conversion_event_name`, o índice único
// `(event_key, destination)` que sustenta a idempotência do beacon, e o
// `leadId` nulo — este é o primeiro evento de conversão da história do sistema
// que nasce ANTES de existir lead, e uma FK obrigatória o teria matado.
//
// Skip se DATABASE_URL ausente.

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { chaveDoInicioDeConversa } from "./chave-do-inicio-de-conversa";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("B3 — início de conversa no servidor (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let registrarInicioDeConversa: typeof import("./inicio-de-conversa").registrarInicioDeConversa;
	let completarFbpDaVisita: typeof import("@/lib/attribution/visit-store").completarFbpDaVisita;

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const eventKeys: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ registrarInicioDeConversa } = await import("./inicio-de-conversa"));
		({ completarFbpDaVisita } = await import("@/lib/attribution/visit-store"));
	});

	afterAll(async () => {
		if (eventKeys.length > 0) {
			await db
				.delete(schema.conversionEvents)
				.where(inArray(schema.conversionEvents.eventKey, eventKeys));
		}
		if (convIds.length > 0) {
			await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	async function visitaPaga(overrides: Partial<typeof schema.visits.$inferInsert> = {}) {
		const [v] = await db
			.insert(schema.visits)
			.values({
				visitorId: `uid-${crypto.randomUUID().slice(0, 12)}`,
				channel: "web",
				landingPath: "/",
				utmCampaign: "bofu-carro",
				fbclid: "IwAR-b3",
				fbp: "fb.1.1700000000000.987654321",
				userAgent: "Mozilla/5.0 (iPhone)",
				...overrides,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(v.id);
		return v.id;
	}

	async function eventoDe(eventId: string) {
		const chave = chaveDoInicioDeConversa(eventId);
		return db.query.conversionEvents.findFirst({
			where: eq(schema.conversionEvents.eventKey, chave),
		});
	}

	function registrar(eventId: string) {
		eventKeys.push(chaveDoInicioDeConversa(eventId));
		return eventId;
	}

	it("grava o evento pendente com a origem da visita dentro", async () => {
		const visitId = await visitaPaga();
		const eventId = registrar(crypto.randomUUID());

		await registrarInicioDeConversa({ eventId, visitId });

		const evento = await eventoDe(eventId);
		expect(evento).toBeTruthy();
		expect(evento?.eventName).toBe("chat_iniciado");
		expect(evento?.status).toBe("pending");
		expect(evento?.visitId).toBe(visitId);
		// `fbc` montado do `fbclid` e `fbp` copiado da visita: é o par que a Meta
		// usa para reconhecer quem converteu.
		expect(evento?.fbc).toContain("IwAR-b3");
		expect(evento?.fbp).toBe("fb.1.1700000000000.987654321");
		expect(evento?.actionSource).toBe("website");
	});

	it("NUNCA carrega valor — é sinal de interesse, não de receita", async () => {
		const eventId = registrar(crypto.randomUUID());
		await registrarInicioDeConversa({ eventId, visitId: await visitaPaga() });

		const evento = await eventoDe(eventId);
		expect(evento?.value).toBeNull();
		// E nasce sem lead: este é o primeiro evento de conversão do sistema que
		// existe antes de haver lead nenhum.
		expect(evento?.leadId).toBeNull();
	});

	it("a chave é a mesma que o pixel manda como eventID", async () => {
		const eventId = registrar(crypto.randomUUID());
		await registrarInicioDeConversa({ eventId, visitId: null });

		const evento = await eventoDe(eventId);
		// `meta-capi.ts` envia `event_id: eventKey`. Se este formato divergir do
		// que o pixel usa, a Meta conta a MESMA abertura duas vezes — e o sintoma
		// é uma métrica que subiu, que ninguém investiga.
		expect(evento?.eventKey).toBe(chaveDoInicioDeConversa(eventId));
		expect(evento?.eventKey.startsWith("chat:")).toBe(true);
	});

	it("beacon repetido não vira segundo sinal", async () => {
		const eventId = registrar(crypto.randomUUID());
		const visitId = await visitaPaga();

		await registrarInicioDeConversa({ eventId, visitId });
		await registrarInicioDeConversa({ eventId, visitId });
		await registrarInicioDeConversa({ eventId, visitId });

		const linhas = await db
			.select({ id: schema.conversionEvents.id })
			.from(schema.conversionEvents)
			.where(eq(schema.conversionEvents.eventKey, chaveDoInicioDeConversa(eventId)));
		expect(linhas).toHaveLength(1);
	});

	it("no WhatsApp o evento sai com o TELEFONE hasheado e action_source de mensageria", async () => {
		// O melhor evento de correspondência que esta operação produz: o `waId` é
		// o telefone, conhecido desde o primeiro segundo.
		const [conv] = await db
			.insert(schema.conversations)
			.values({ waId: "5511999887766", channel: "whatsapp" })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		const eventId = registrar(crypto.randomUUID());
		await registrarInicioDeConversa({ eventId, visitId: null, conversationId: conv.id });

		const evento = await eventoDe(eventId);
		expect(evento?.hashedPhone).toMatch(/^[0-9a-f]{64}$/);
		expect(evento?.actionSource).toBe("business_messaging");
		expect(evento?.conversationId).toBe(conv.id);
	});

	it("conversa simulada não vira sinal de mídia", async () => {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ waId: "SIM-b3-teste", channel: "whatsapp", isSimulated: true })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		const eventId = registrar(crypto.randomUUID());
		await registrarInicioDeConversa({ eventId, visitId: null, conversationId: conv.id });

		expect(await eventoDe(eventId)).toBeUndefined();
	});

	it("entra na fila de despacho junto com os marcos de venda", async () => {
		// Não é uma fila paralela: o mesmo `dispatch.ts` que manda Lead/Purchase
		// manda este. O que o separa é o NOME na Meta, não o caminho.
		const eventId = registrar(crypto.randomUUID());
		await registrarInicioDeConversa({ eventId, visitId: await visitaPaga() });

		const pendentes = await db
			.select({ id: schema.conversionEvents.id })
			.from(schema.conversionEvents)
			.where(
				and(
					eq(schema.conversionEvents.status, "pending"),
					eq(schema.conversionEvents.destination, "meta"),
					eq(schema.conversionEvents.eventKey, chaveDoInicioDeConversa(eventId)),
				),
			);
		expect(pendentes).toHaveLength(1);
	});

	describe("B2 — o _fbp que faltava", () => {
		it("completa a visita que nasceu sem fbp", async () => {
			// O caso de 97% do tráfego pago: primeira chegada do navegador, o pixel
			// ainda não rodou, o proxy grava a visita sem `_fbp`.
			const visitId = await visitaPaga({ fbp: null });

			await completarFbpDaVisita(visitId, "fb.1.1788000000000.111222333");

			const visita = await db.query.visits.findFirst({ where: eq(schema.visits.id, visitId) });
			expect(visita?.fbp).toBe("fb.1.1788000000000.111222333");
		});

		it("NÃO reescreve o fbp que a visita já tinha", async () => {
			// Um `_fbp` mais novo chegando depois faria o evento afirmar um aparelho
			// diferente do que de fato originou a conversão.
			const visitId = await visitaPaga({ fbp: "fb.1.1700000000000.original" });
			await completarFbpDaVisita(visitId, "fb.1.1788000000000.999888777");

			const visita = await db.query.visits.findFirst({ where: eq(schema.visits.id, visitId) });
			expect(visita?.fbp).toBe("fb.1.1700000000000.original");
		});

		it("recusa valor fora do formato da Meta", async () => {
			// O valor vem do CORPO de um endpoint público: o que não bate seria lixo
			// enviado como identidade de aparelho.
			const visitId = await visitaPaga({ fbp: null });
			await completarFbpDaVisita(visitId, "<script>alert(1)</script>");

			const visita = await db.query.visits.findFirst({ where: eq(schema.visits.id, visitId) });
			expect(visita?.fbp).toBeNull();
		});

		it("o fbp completado chega ao evento de conversão — que é o ponto", async () => {
			const visitId = await visitaPaga({ fbp: null });
			await completarFbpDaVisita(visitId, "fb.1.1788000000000.444555666");

			const eventId = registrar(crypto.randomUUID());
			await registrarInicioDeConversa({ eventId, visitId });

			const evento = await eventoDe(eventId);
			expect(evento?.fbp).toBe("fb.1.1788000000000.444555666");
		});
	});
});
