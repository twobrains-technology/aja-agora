// Atribuição de mídia (integration-db) — a corrente visita → conversa.
//
// Estes são os números que decidem onde a verba vai. Testar contra Postgres
// real, não mock: o que quebra aqui é chave estrangeira, unicidade e o
// `NOT EXISTS` da reivindicação — nada disso aparece com repositório fingido.
//
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CampaignParams } from "./params";
import type { CtwaReferral } from "./referral";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const SEM_CAMPANHA: CampaignParams = {
	utmSource: null,
	utmMedium: null,
	utmCampaign: null,
	utmContent: null,
	utmTerm: null,
	gclid: null,
	fbclid: null,
};

describeIfDb("atribuição de visita (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let store: typeof import("./visit-store");
	let getOrCreateConversation: typeof import("@/lib/whatsapp/session").getOrCreateConversation;

	const visitIds: string[] = [];
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		store = await import("./visit-store");
		({ getOrCreateConversation } = await import("@/lib/whatsapp/session"));
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	function rastrear(visitId: string): string {
		visitIds.push(visitId);
		return visitId;
	}

	async function lerVisita(visitId: string) {
		return db.query.visits.findFirst({ where: eq(schema.visits.id, visitId) });
	}

	describe("recordWebVisit", () => {
		it("grava a origem completa de uma chegada por anúncio", async () => {
			const visitId = rastrear(crypto.randomUUID());

			await store.recordWebVisit({
				visitId,
				visitorId: "a".repeat(32),
				params: {
					utmSource: "facebook",
					utmMedium: "cpc",
					utmCampaign: "consorcio-carro-agosto",
					utmContent: "criativo-video-3",
					utmTerm: null,
					gclid: null,
					fbclid: "IwAR0teste",
				},
				landingPath: "/",
				referrer: "https://l.facebook.com/",
				userAgent: "Mozilla/5.0 (iPhone)",
			});

			expect(await lerVisita(visitId)).toMatchObject({
				channel: "web",
				utmSource: "facebook",
				utmCampaign: "consorcio-carro-agosto",
				utmContent: "criativo-video-3",
				fbclid: "IwAR0teste",
				landingPath: "/",
			});
		});

		it("é idempotente — a mesma visita chegando duas vezes não vira duas linhas", async () => {
			// Refresh, retry do Next e dupla renderização em dev repetem a chamada.
			// Visita duplicada infla o denominador e derruba toda taxa de conversão.
			const visitId = rastrear(crypto.randomUUID());
			const entrada = {
				visitId,
				visitorId: "b".repeat(32),
				params: SEM_CAMPANHA,
				landingPath: "/",
				referrer: null,
				userAgent: null,
			};

			await store.recordWebVisit(entrada);
			await store.recordWebVisit(entrada);

			const linhas = await db.select().from(schema.visits).where(eq(schema.visits.id, visitId));
			expect(linhas).toHaveLength(1);
		});

		it("grava visita direta, sem campanha nenhuma", async () => {
			const visitId = rastrear(crypto.randomUUID());

			await store.recordWebVisit({
				visitId,
				visitorId: "c".repeat(32),
				params: SEM_CAMPANHA,
				landingPath: "/",
				referrer: null,
				userAgent: null,
			});

			expect(await lerVisita(visitId)).toMatchObject({ channel: "web", utmSource: null });
		});
	});

	describe("visitExists", () => {
		it("reconhece visita existente e desconhece visita fantasma", async () => {
			const visitId = rastrear(crypto.randomUUID());
			await store.recordWebVisit({
				visitId,
				visitorId: "d".repeat(32),
				params: SEM_CAMPANHA,
				landingPath: "/",
				referrer: null,
				userAgent: null,
			});

			expect(await store.visitExists(visitId)).toBe(true);
			// Cookie que sobreviveu ao marco zero: precisa dar `false`, não explodir.
			expect(await store.visitExists(crypto.randomUUID())).toBe(false);
		});
	});

	describe("resolveVisitIdFromCookie — o lado web da corrente", () => {
		async function semearVisita(): Promise<string> {
			const visitId = rastrear(crypto.randomUUID());
			await store.recordWebVisit({
				visitId,
				visitorId: "e".repeat(32),
				params: SEM_CAMPANHA,
				landingPath: "/",
				referrer: null,
				userAgent: null,
			});
			return visitId;
		}

		it("devolve a visita do cookie carimbado pelo middleware", async () => {
			const visitId = await semearVisita();

			expect(await store.resolveVisitIdFromCookie(`${visitId}.${Date.now()}`)).toBe(visitId);
		});

		it("devolve nulo quando o visitante não passou pela landing", async () => {
			expect(await store.resolveVisitIdFromCookie(null)).toBeNull();
			expect(await store.resolveVisitIdFromCookie("")).toBeNull();
		});

		it("devolve nulo pra cookie corrompido, em vez de deixar quebrar mais na frente", async () => {
			expect(await store.resolveVisitIdFromCookie("lixo.abc")).toBeNull();
		});

		it("devolve nulo quando o cookie sobrevive ao marco zero", async () => {
			// Cenário real logo depois de zerar a base: o browser do cliente ainda
			// tem o cookie, a visita não existe mais. Sem isto, a chave estrangeira
			// estouraria no meio do chat — a atribuição derrubaria a venda.
			expect(
				await store.resolveVisitIdFromCookie(`${crypto.randomUUID()}.${Date.now()}`),
			).toBeNull();
		});
	});

	describe("Click-to-WhatsApp", () => {
		const referral: CtwaReferral = {
			ctwaClid: "AfXyZteste123",
			sourceId: "120210000000000000",
			sourceUrl: "https://fb.me/2abcDEF",
			sourceType: "ad",
			headline: "Compare consórcios em 2 minutos",
		};

		function novoWaId(): string {
			return `55119${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
		}

		it("grava a visita vinda do anúncio", async () => {
			const waId = novoWaId();

			const visitId = await store.recordWhatsAppVisit(waId, referral);
			expect(visitId).not.toBeNull();
			rastrear(visitId as string);

			expect(await lerVisita(visitId as string)).toMatchObject({
				channel: "whatsapp",
				visitorId: waId,
				ctwaClid: "AfXyZteste123",
				ctwaSourceId: "120210000000000000",
			});
		});

		it("a conversa criada depois do clique reivindica a visita do anúncio", async () => {
			// O descompasso real do WhatsApp: o webhook grava a visita e só então o
			// processador cria a conversa. Se a ponte falhar aqui, toda campanha de
			// Click-to-WhatsApp fica sem origem.
			const waId = novoWaId();
			const visitId = rastrear((await store.recordWhatsAppVisit(waId, referral)) as string);

			const { id: convId } = await getOrCreateConversation(waId);
			convIds.push(convId);

			const conversa = await db.query.conversations.findFirst({
				where: eq(schema.conversations.id, convId),
			});
			expect(conversa?.visitId).toBe(visitId);
		});

		it("não devolve visita que outra conversa já reivindicou", async () => {
			const waId = novoWaId();
			rastrear((await store.recordWhatsAppVisit(waId, referral)) as string);

			const { id: convId } = await getOrCreateConversation(waId);
			convIds.push(convId);

			// Um segundo clique não pode roubar a atribuição de uma conversa que já
			// tem origem — senão a última campanha leva o crédito da venda que outra
			// começou.
			expect(await store.findUnclaimedWhatsAppVisit(waId)).toBeNull();
		});

		it("ignora visita fora da janela de 24h", async () => {
			const waId = novoWaId();
			const visitId = rastrear((await store.recordWhatsAppVisit(waId, referral)) as string);

			await db
				.update(schema.visits)
				.set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
				.where(eq(schema.visits.id, visitId));

			expect(await store.findUnclaimedWhatsAppVisit(waId)).toBeNull();
		});

		it("não confunde o anúncio de um número com o de outro", async () => {
			const waId = novoWaId();
			rastrear((await store.recordWhatsAppVisit(waId, referral)) as string);

			expect(await store.findUnclaimedWhatsAppVisit(novoWaId())).toBeNull();
		});

		it("conversa simulada não reivindica atribuição de campanha", async () => {
			// Teste interno sujando o relatório da campanha é como verba vai pro
			// criativo errado.
			const waIdSimulado = `SIM-${crypto.randomUUID()}`;
			const visitId = rastrear((await store.recordWhatsAppVisit(waIdSimulado, referral)) as string);

			const { id: convId } = await getOrCreateConversation(waIdSimulado);
			convIds.push(convId);

			const conversa = await db.query.conversations.findFirst({
				where: eq(schema.conversations.id, convId),
			});
			expect(conversa?.visitId).toBeNull();
			expect(await store.findUnclaimedWhatsAppVisit(waIdSimulado)).toBe(visitId);
		});
	});
});
