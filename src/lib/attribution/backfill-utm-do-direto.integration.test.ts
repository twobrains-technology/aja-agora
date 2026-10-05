// B3 / P5 — o backfill da UTM das visitas que nasceram em `/` vindas de `/direto`.
//
// O conserto do código (`/direto` entra em `LANDINGS`/`matcher`) vale daqui para
// a frente. Esta migration devolve a campanha às visitas que JÁ existem: a UTM
// não é inferida, ela está escrita no `referrer` que o navegador mandou — o
// backfill só transcreve para a coluna o que já veio na requisição.
//
// Roda o ARQUIVO da migration de verdade (`drizzle/0064_…sql`), não uma cópia:
// assim o teste prova o que vai ao ar, e um erro de sintaxe no `.sql` cai aqui
// em vez de derrubar o deploy.
//
// Skip se `DATABASE_URL` ausente (CI sem banco). Contra o Postgres LOCAL do
// workspace — nunca produção.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inArray, sql as drizzleSql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const SQL = readFileSync(join(process.cwd(), "drizzle/0064_backfill_utm_do_direto.sql"), "utf-8");

describeIfDb("B3 — backfill da UTM do /direto (integration)", () => {
	let db: typeof import("@/db").db;
	let visits: typeof import("@/db/schema").visits;

	const ids: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		({ visits } = await import("@/db/schema"));
	});

	afterAll(async () => {
		if (ids.length > 0) {
			await db.delete(visits).where(inArray(visits.id, ids));
		}
	});

	async function semear(entrada: {
		landingPath: string;
		referrer: string | null;
		utmCampaign?: string | null;
		fbclid?: string | null;
	}) {
		const id = crypto.randomUUID();
		ids.push(id);
		await db.insert(visits).values({
			id,
			visitorId: crypto.randomUUID().replace(/-/g, ""),
			channel: "web",
			landingPath: entrada.landingPath,
			referrer: entrada.referrer,
			utmCampaign: entrada.utmCampaign ?? null,
			fbclid: entrada.fbclid ?? null,
			userAgent: "Mozilla/5.0 (integration test)",
		});
		return id;
	}

	async function ler(id: string) {
		return db.query.visits.findFirst({ where: (t, { eq }) => eq(t.id, id) });
	}

	async function aplicar() {
		await db.execute(drizzleSql.raw(SQL));
	}

	it("preenche a campanha de uma visita órfã a partir do referrer do /direto", async () => {
		const id = await semear({
			landingPath: "/",
			referrer:
				"https://ajaagora.com.br/direto?utm_source=meta&utm_campaign=120210000000000000&utm_content=120210000000000001&utm_term=120210000000000002&fbclid=IwAR0direto",
		});

		await aplicar();

		expect(await ler(id)).toMatchObject({
			utmSource: "meta",
			utmCampaign: "120210000000000000",
			utmContent: "120210000000000001",
			utmTerm: "120210000000000002",
			fbclid: "IwAR0direto",
			// O id determinístico da Meta sai da própria UTM — mesmo fallback do
			// `parseCampaignParams`.
			campaignId: "120210000000000000",
			adsetId: "120210000000000002",
			adId: "120210000000000001",
		});
	});

	it("é idempotente — reaplicar não muda a linha nem apaga campanha já gravada", async () => {
		const id = await semear({
			landingPath: "/",
			referrer: "https://www.ajaagora.com.br/direto?utm_source=meta&utm_campaign=120210000000000099",
		});

		await aplicar();
		const primeira = await ler(id);

		await aplicar();
		const segunda = await ler(id);

		expect(segunda).toEqual(primeira);
	});

	it("não toca visita que já tem campanha", async () => {
		const id = await semear({
			landingPath: "/",
			referrer: "https://ajaagora.com.br/direto?utm_source=meta&utm_campaign=outra-campanha",
			utmCampaign: "campanha-original",
		});

		await aplicar();

		// Nunca reescreve um valor já gravado: a UTM original continua sendo a dona.
		expect(await ler(id)).toMatchObject({ utmCampaign: "campanha-original" });
	});

	it("não inventa atribuição para referrer que não é /direto nosso", async () => {
		const id = await semear({
			landingPath: "/",
			referrer: "https://l.facebook.com/",
		});

		await aplicar();

		expect(await ler(id)).toMatchObject({ utmCampaign: null, utmSource: null, fbclid: null });
	});

	it("ignora referrer de /direto sem utm_campaign", async () => {
		const id = await semear({
			landingPath: "/",
			referrer: "https://ajaagora.com.br/direto?utm_source=meta&fbclid=IwARsemCampanha",
		});

		await aplicar();

		// Sem campanha no referrer não há o que recuperar — e exigir `utm_campaign`
		// é justamente o que mantém a migration idempotente.
		expect(await ler(id)).toMatchObject({ utmCampaign: null, utmSource: null, fbclid: null });
	});
});