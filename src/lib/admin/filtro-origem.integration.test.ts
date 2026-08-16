// O invariante que este arquivo protege: o número que a tabela por origem
// mostra é o número de conversas que o clique abre.
//
// Testar contra Postgres real, e não com mock, porque o que pode divergir é
// exatamente o SQL — a tabela agrupa por `rotularOrigem` (TypeScript) e o
// filtro seleciona por predicado (SQL). Se as duas precedências saírem de
// sincronia, clicar em "4" abre 3, e nenhum teste unitário perceberia.

import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const JANELA_DE = new Date("2019-05-01T00:00:00Z");
const JANELA_ATE = new Date("2019-05-31T23:59:59Z");
const DENTRO = new Date("2019-05-15T12:00:00Z");

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

describeIfDb("filtro por origem — o clique abre o que o número prometeu", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./performance-queries");
	let agrupar: typeof import("./agrupar-origens");
	let filtro: typeof import("./filtro-origem");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./performance-queries");
		agrupar = await import("./agrupar-origens");
		filtro = await import("./filtro-origem");

		async function semear(v: {
			utmSource?: string;
			utmCampaign?: string;
			ctwaHeadline?: string;
			referrer?: string;
			comConversa: boolean;
		}) {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: `f-${crypto.randomUUID()}`,
					channel: "web",
					createdAt: DENTRO,
					userAgent: UA_GENTE,
					utmSource: v.utmSource ?? null,
					utmCampaign: v.utmCampaign ?? null,
					ctwaHeadline: v.ctwaHeadline ?? null,
					referrer: v.referrer ?? null,
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);
			if (!v.comConversa) return;

			const [conversa] = await db
				.insert(schema.conversations)
				.values({
					channel: "web",
					visitId: visita.id,
					isSimulated: false,
					createdAt: DENTRO,
					updatedAt: DENTRO,
				})
				.returning({ id: schema.conversations.id });
			convIds.push(conversa.id);
		}

		// Instagram, duas campanhas — 3 conversas no canal.
		await semear({ utmSource: "ig", utmCampaign: "camp-1", comConversa: true });
		await semear({ utmSource: "ig", utmCampaign: "camp-1", comConversa: true });
		await semear({ utmSource: "ig", utmCampaign: "camp-2", comConversa: true });
		await semear({ utmSource: "ig", utmCampaign: "camp-2", comConversa: false });
		// Maiúscula: o anunciante digitou "IG" numa das UTMs.
		await semear({ utmSource: "IG", utmCampaign: "camp-1", comConversa: true });
		// Facebook — 1.
		await semear({ utmSource: "fb", utmCampaign: "camp-fb", comConversa: true });
		// Click-to-WhatsApp — 1.
		await semear({ ctwaHeadline: "consórcio sem juros", comConversa: true });
		// Referência — 1.
		await semear({ referrer: "https://blog.parceiro.com.br/post", comConversa: true });
		// Direto — 2.
		await semear({ comConversa: true });
		await semear({ comConversa: true });
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	/** Quantas conversas o filtro devolve — o que a tela de Conversas mostraria. */
	async function contarComFiltro(origem: string, campanha?: string): Promise<number> {
		const condicao = filtro.condicaoDeOrigem(origem, campanha);
		expect(condicao, `origem "${origem}" devia produzir condição`).not.toBeNull();
		const r = await db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total FROM conversations
      WHERE is_simulated = false
        AND created_at BETWEEN ${JANELA_DE} AND ${JANELA_ATE}
        AND ${condicao}
    `);
		return Number(r.rows[0]?.total ?? 0);
	}

	it("o número de cada canal na tabela é o que o filtro devolve", async () => {
		const canais = agrupar.agruparPorCanal(await queries.computeOrigens(JANELA_DE, JANELA_ATE));

		expect(canais.length).toBeGreaterThan(0);
		for (const canal of canais) {
			const doFiltro = await contarComFiltro(canal.chave);
			expect(doFiltro, `canal ${canal.chave} (${canal.nome})`).toBe(canal.conversas);
		}
	});

	it("o número de cada CAMPANHA também bate, não só o do canal", async () => {
		const canais = agrupar.agruparPorCanal(await queries.computeOrigens(JANELA_DE, JANELA_ATE));
		const instagram = canais.find((c) => c.chave === "campanha:ig");
		expect(instagram).toBeDefined();

		for (const linha of instagram?.detalhe ?? []) {
			if (!linha.origem.campanha) continue;
			const doFiltro = await contarComFiltro(instagram?.chave ?? "", linha.origem.campanha);
			expect(doFiltro, `campanha ${linha.origem.campanha}`).toBe(linha.conversas);
		}
	});

	it("junta 'IG' e 'ig' — quem digitou a UTM não decide o recorte", async () => {
		// A tabela consolida por rótulo; o filtro precisa consolidar igual, senão
		// o canal mostra 4 e o clique abre 3.
		expect(await contarComFiltro("campanha:ig")).toBe(4);
	});

	it("não confunde Click-to-WhatsApp, referência e direto entre si", async () => {
		expect(await contarComFiltro("ctwa")).toBe(1);
		expect(await contarComFiltro("referencia")).toBe(1);
		expect(await contarComFiltro("direto")).toBe(2);
	});

	it("chave desconhecida não filtra nada — link velho mostra tudo, não zero", async () => {
		// Lista vazia mentiria dizendo "nenhuma conversa veio daqui".
		expect(filtro.condicaoDeOrigem("campanha:")).toBeNull();
		expect(filtro.condicaoDeOrigem("qualquer-coisa")).toBeNull();
		expect(filtro.condicaoDeOrigem("")).toBeNull();
		expect(filtro.condicaoDeOrigem(null)).toBeNull();
	});
});
