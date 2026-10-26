// Integration (DB real) — L42/P313: o feedback do simulador vira SINAL PERSISTIDO.
//
// Antes a rota só escrevia em stdout (`publicarScores`): o operador dava 👍/👎 e a
// avaliação não ficava em lugar nenhum. Aqui o teste morde no que importa: a
// LINHA em `sinais_de_conversa` (conversa, turno, valor, comentário, autor) e a
// leitura de volta pelo GET. Skip se DATABASE_URL ausente/sentinel.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: async () => ({
		error: null,
		role: "admin",
		session: { user: { id: "user-op-integration", email: "operador@aja.test" } },
	}),
}));
vi.mock("@/lib/utils/env", () => ({ isSimulatorEnabled: () => true }));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("L42/P313 — feedback do simulador persistido (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let route: typeof import("./route");

	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		route = await import("./route");
	});

	afterAll(async () => {
		for (const id of convIds) {
			await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
	});

	async function seedSimulada() {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", status: "active", isSimulated: true, metadata: {} })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);
		return conv.id;
	}

	const chamar = (metodo: "GET" | "POST", id: string, body?: unknown) =>
		(metodo === "GET" ? route.GET : route.POST)(
			new Request("http://localhost/api", {
				method: metodo,
				headers: { "Content-Type": "application/json" },
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			}) as unknown as Parameters<typeof route.POST>[0],
			{ params: Promise.resolve({ id }) },
		);

	it("POST grava uma linha por avaliação, com conversa, turno, valor, comentário e autor", async () => {
		const id = await seedSimulada();
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const res = await chamar("POST", id, {
				value: "down",
				traceId: "trace-integracao-1",
				comment: "repetiu a mesma pergunta",
			});
			expect(res.status).toBe(200);
		} finally {
			log.mockRestore();
		}

		const linhas = await db
			.select()
			.from(schema.sinaisDeConversa)
			.where(eq(schema.sinaisDeConversa.conversationId, id));
		expect(linhas).toHaveLength(1);
		expect(linhas[0]).toMatchObject({
			conversationId: id,
			traceId: "trace-integracao-1",
			origem: "simulador",
			nome: "user_feedback",
			valor: 0,
			comentario: "repetiu a mesma pergunta",
			criadoPor: "operador@aja.test",
		});
	});

	it("sem `traceId` nem comentário a linha existe assim mesmo (campos nulos, não ausentes)", async () => {
		const id = await seedSimulada();
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			expect((await chamar("POST", id, { value: "up" })).status).toBe(200);
		} finally {
			log.mockRestore();
		}

		const [linha] = await db
			.select()
			.from(schema.sinaisDeConversa)
			.where(eq(schema.sinaisDeConversa.conversationId, id));
		expect(linha.valor).toBe(1);
		expect(linha.traceId).toBeNull();
		expect(linha.comentario).toBeNull();
	});

	it("GET devolve as avaliações da conversa (e só as dela)", async () => {
		const avaliada = await seedSimulada();
		const outra = await seedSimulada();
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			await chamar("POST", avaliada, { value: "up", traceId: "turno-a" });
			await chamar("POST", avaliada, { value: "down", comment: "enrolou" });
			await chamar("POST", outra, { value: "up" });
		} finally {
			log.mockRestore();
		}

		const res = await chamar("GET", avaliada);
		expect(res.status).toBe(200);
		const { avaliacoes } = (await res.json()) as {
			avaliacoes: Array<{ valor: number; comentario: string | null; traceId: string | null }>;
		};

		expect(avaliacoes).toHaveLength(2);
		expect(avaliacoes.map((a) => a.comentario)).toEqual(["enrolou", null]);
		expect(avaliacoes[1].traceId).toBe("turno-a");
		expect(avaliacoes[0].valor).toBe(0);
	});

	it("conversa de simulador inexistente continua 404 nos dois verbos", async () => {
		const fantasma = "99999999-9999-4999-8999-999999999999";
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			expect((await chamar("POST", fantasma, { value: "up" })).status).toBe(404);
		} finally {
			log.mockRestore();
		}
		expect((await chamar("GET", fantasma)).status).toBe(404);
	});
});
