// Integration (DB real) — "Enviar para a mesa" em lote a partir do Percurso.
//
// O que este teste protege: a Bruna pediu (15/09) um jeito de mandar para a mesa
// quem parou no caminho sem abrir conversa por conversa. A rota usa o MESMO
// `createMesaHandoff` do transbordo normal — o risco é alguém reimplementar o
// handoff aqui e esquecer de calar o agente ou de mover o lead de raia.
//
// A segunda asserção é a recusa: um lead que chegou pela WEB não tem aparelho de
// WhatsApp para o atendente responder, então a rota recusa com o motivo escrito
// (é o que a tela desabilita por linha, com o tooltip "Só para conversas de
// WhatsApp").
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
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

function post(body: unknown) {
	return new NextRequest("http://test/api/admin/percurso/enviar-para-mesa", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb("enviar para a mesa em lote (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let POST: typeof import("./route").POST;

	let convWhats: string;
	let convWeb: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ POST } = await import("./route"));

		// O `mesa_handoffs.created_by` tem FK para `user`: o mock de sessão usa
		// este id, então ele precisa existir de verdade.
		await db
			.insert(schema.user)
			.values({ id: "test-admin", name: "Admin de teste", email: "test-admin@fixture.local" })
			.onConflictDoNothing({ target: schema.user.id });

		const [whats] = await db
			.insert(schema.conversations)
			.values({
				channel: "whatsapp",
				waId: "5562999990000",
				contactName: "Fixture envio para a mesa",
			})
			.returning({ id: schema.conversations.id });
		convWhats = whats.id;
		const [web] = await db
			.insert(schema.conversations)
			.values({ channel: "web", contactName: "Fixture envio web" })
			.returning({ id: schema.conversations.id });
		convWeb = web.id;

		await db.insert(schema.leads).values([
			{ conversationId: convWhats, name: "Fixture mesa whats", phone: "5562999990000" },
			{ conversationId: convWeb, name: "Fixture mesa web", phone: "11999990000" },
		]);
	});

	afterAll(async () => {
		// mesa_handoffs cai por cascade do lead; lead cai por cascade da conversa.
		for (const id of [convWhats, convWeb]) {
			if (id) await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
		}
		// Só depois das conversas: o handoff referencia o usuário, e ele cai no cascade.
		await db.delete(schema.user).where(eq(schema.user.id, "test-admin"));
	});

	it("envia a conversa de WhatsApp e cria o handoff", async () => {
		const res = await POST(post({ ids: [convWhats] }));
		expect(res.status).toBe(200);
		const corpo = (await res.json()) as { enviados: number; resultados: { ok: boolean }[] };
		expect(corpo.enviados).toBe(1);
		expect(corpo.resultados[0]?.ok).toBe(true);

		const handoff = await db.query.mesaHandoffs.findFirst({
			where: eq(schema.mesaHandoffs.conversationId, convWhats),
		});
		expect(handoff).toBeTruthy();
	});

	it("recusa a conversa web com o motivo escrito", async () => {
		const res = await POST(post({ ids: [convWeb] }));
		expect(res.status).toBe(200);
		const corpo = (await res.json()) as {
			enviados: number;
			resultados: { ok: boolean; motivo?: string }[];
		};
		expect(corpo.enviados).toBe(0);
		expect(corpo.resultados[0]?.motivo).toBe("Só para conversas de WhatsApp.");

		const handoff = await db.query.mesaHandoffs.findFirst({
			where: eq(schema.mesaHandoffs.conversationId, convWeb),
		});
		expect(handoff).toBeFalsy();
	});

	it("listas vazias são recusadas", async () => {
		const res = await POST(post({ ids: [] }));
		expect(res.status).toBe(400);
	});
});
