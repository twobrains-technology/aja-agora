/**
 * O lead diz de qual campanha ele veio.
 *
 * A cadeia existe no banco desde a instrumentação de atribuição — `leads` →
 * `conversations.visit_id` → `visits.utm_*` — mas parava no caminho: a pipeline
 * mostrava canal (web/WhatsApp) e nunca a campanha, então "de onde veio esse
 * lead?" só tinha resposta agregada, na tela de Performance.
 *
 * O que este teste protege é a coerência: a origem do lead sai do MESMO
 * `rotularOrigem` que nomeia as linhas da tabela por origem. Se um lado
 * divergisse do outro, o painel diria "Instagram" numa tela e outra coisa na
 * outra, para o mesmo cliente.
 *
 * Integration test: bate no Postgres real.
 */
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { conversations, leads, visits } from "@/db/schema";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn().mockResolvedValue({
		error: null,
		session: { user: { id: "test-admin", role: "admin" } },
		role: "admin",
	}),
}));

const { GET } = await import("./route");

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

interface CardDeLead {
	id: string;
	origem?: { tipo: string; label: string; fonte: string | null; campanha: string | null } | null;
}

describeIfDb("GET /api/admin/leads — origem do lead", () => {
	const visitIds: string[] = [];
	const convIds: string[] = [];
	const leadIds: string[] = [];

	async function semearLead(v: {
		utmSource?: string;
		utmCampaign?: string;
		referrer?: string;
		semVisita?: boolean;
	}): Promise<string> {
		let visitId: string | null = null;
		if (!v.semVisita) {
			const [visita] = await db
				.insert(visits)
				.values({
					visitorId: `o-${crypto.randomUUID()}`,
					channel: "web",
					utmSource: v.utmSource ?? null,
					utmCampaign: v.utmCampaign ?? null,
					referrer: v.referrer ?? null,
				})
				.returning({ id: visits.id });
			visitIds.push(visita.id);
			visitId = visita.id;
		}

		const [conversa] = await db
			.insert(conversations)
			.values({ channel: "web", visitId, isSimulated: false })
			.returning({ id: conversations.id });
		convIds.push(conversa.id);

		const [lead] = await db
			.insert(leads)
			.values({
				conversationId: conversa.id,
				name: "Cliente de Origem",
				phone: `+5511${Math.floor(Math.random() * 1e8)}`,
				stage: "qualificado",
				isSimulated: false,
			})
			.returning({ id: leads.id });
		leadIds.push(lead.id);
		return lead.id;
	}

	let idDeCampanha: string;
	let idDireto: string;
	let idSemVisita: string;

	beforeAll(async () => {
		idDeCampanha = await semearLead({ utmSource: "ig", utmCampaign: "consorcio-agosto" });
		idDireto = await semearLead({});
		idSemVisita = await semearLead({ semVisita: true });
	});

	afterAll(async () => {
		if (leadIds.length > 0) await db.delete(leads).where(inArray(leads.id, leadIds));
		if (convIds.length > 0)
			await db.delete(conversations).where(inArray(conversations.id, convIds));
		if (visitIds.length > 0) await db.delete(visits).where(inArray(visits.id, visitIds));
	});

	async function buscar(): Promise<Map<string, CardDeLead>> {
		const res = await GET();
		expect(res.status).toBe(200);
		const json = (await res.json()) as { leads: Record<string, CardDeLead[]> };
		const todos = Object.values(json.leads).flat();
		// Sem o lead semeado na resposta, as asserções abaixo passariam por
		// engano (`undefined?.origem ?? null` é `null`).
		expect(todos.length).toBeGreaterThan(0);
		return new Map(todos.map((l) => [l.id, l]));
	}

	it("nomeia a campanha de onde o lead veio", async () => {
		const card = (await buscar()).get(idDeCampanha);
		expect(card?.origem).toMatchObject({
			tipo: "campanha",
			fonte: "ig",
			campanha: "consorcio-agosto",
		});
	});

	it("diz 'direto' quando a visita existe mas não trouxe campanha", async () => {
		// Importa distinguir de "não sei": o lead chegou pela landing, sem UTM.
		// Medido em produção em 15/08/2026: de 16 leads em 30 dias, só 4 tinham
		// UTM. Dizer "direto" nos outros 12 é o honesto.
		const card = (await buscar()).get(idDireto);
		expect(card?.origem).toMatchObject({ tipo: "direto" });
	});

	it("devolve null quando não há visita — não inventa origem", async () => {
		// Conversa que nasceu fora da landing (WhatsApp orgânico, importação).
		// Rotular isso como "direto" seria afirmar uma chegada que ninguém mediu.
		const card = (await buscar()).get(idSemVisita);
		expect(card?.origem ?? null).toBeNull();
	});
});
