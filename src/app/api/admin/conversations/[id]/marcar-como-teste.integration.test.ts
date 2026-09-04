// Integration (DB real) — marcar uma conversa como TESTE pelo backoffice.
//
// O que este teste protege, e por que ele existe:
//
// Medido no banco de produção em 04/09/2026: `is_simulated` era `false` em 100%
// das linhas, e ainda assim 6 leads, 2 propostas (R$ 371.258) e 2 handoffs eram
// teste feito EM PRODUÇÃO com o documento da casa. A flag só é escrita pelo
// simulador (`/api/admin/simulator/sessions`) — não existia caminho para marcar
// uma conversa que já nasceu.
//
// O efeito no relatório era de 20% do pipeline e 33% da fila da mesa.
//
// A asserção que importa não é "a coluna virou true": é **o lead parar de contar
// no funil**. Por isso o teste checa os dois lados — a marcação e a leitura.
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: "test-admin" } },
		role: "admin",
	})),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function patch(id: string, body: unknown) {
	return new Request(`http://test/api/admin/conversations/${id}`, {
		method: "PATCH",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb("marcar conversa como teste (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let PATCH: typeof import("./route").PATCH;

	let convId: string;
	let leadId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ PATCH } = await import("./route"));

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", contactName: "Fixture marcação de teste" })
			.returning({ id: schema.conversations.id });
		convId = conv.id;

		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId: convId, name: "Fixture marcação de teste", phone: "11999990000" })
			.returning({ id: schema.leads.id });
		leadId = lead.id;
	});

	afterAll(async () => {
		if (leadId) await db.delete(schema.leads).where(eq(schema.leads.id, leadId));
		if (convId) await db.delete(schema.conversations).where(eq(schema.conversations.id, convId));
	});

	it("nasce contando como conversa e lead de verdade", async () => {
		const conv = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, convId),
			columns: { isSimulated: true },
		});
		const lead = await db.query.leads.findFirst({
			where: eq(schema.leads.id, leadId),
			columns: { isSimulated: true },
		});
		expect(conv?.isSimulated).toBe(false);
		expect(lead?.isSimulated).toBe(false);
	});

	it("marca a conversa E o lead — marcar só a conversa deixaria o lead no funil", async () => {
		const res = await PATCH(patch(convId, { isSimulated: true }), {
			params: Promise.resolve({ id: convId }),
		});
		expect(res.status).toBe(200);

		const conv = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, convId),
			columns: { isSimulated: true },
		});
		const lead = await db.query.leads.findFirst({
			where: eq(schema.leads.id, leadId),
			columns: { isSimulated: true },
		});
		expect(conv?.isSimulated).toBe(true);
		expect(lead?.isSimulated).toBe(true);
	});

	it("o lead marcado some da contagem do funil", async () => {
		// A mesma condição que `computeFunilMidia` usa para contar identificados.
		const contados = await db
			.select({ id: schema.leads.id })
			.from(schema.leads)
			.where(and(eq(schema.leads.id, leadId), eq(schema.leads.isSimulated, false)));
		expect(contados).toHaveLength(0);
	});

	it("desmarca — classificar errado é rotina, e a tela precisa poder voltar atrás", async () => {
		const res = await PATCH(patch(convId, { isSimulated: false }), {
			params: Promise.resolve({ id: convId }),
		});
		expect(res.status).toBe(200);

		const conv = await db.query.conversations.findFirst({
			where: eq(schema.conversations.id, convId),
			columns: { isSimulated: true },
		});
		const lead = await db.query.leads.findFirst({
			where: eq(schema.leads.id, leadId),
			columns: { isSimulated: true },
		});
		expect(conv?.isSimulated).toBe(false);
		expect(lead?.isSimulated).toBe(false);
	});

	it("recusa corpo inválido", async () => {
		const res = await PATCH(patch(convId, { isSimulated: "sim" }), {
			params: Promise.resolve({ id: convId }),
		});
		expect(res.status).toBe(400);
	});

	it("recusa id que não é UUID, sem tocar no banco", async () => {
		const res = await PATCH(patch("nao-e-uuid", { isSimulated: true }), {
			params: Promise.resolve({ id: "nao-e-uuid" }),
		});
		expect(res.status).toBe(400);
	});

	it("404 para conversa que não existe", async () => {
		const res = await PATCH(patch("00000000-0000-4000-8000-000000000000", { isSimulated: true }), {
			params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
		});
		expect(res.status).toBe(404);
	});
});
