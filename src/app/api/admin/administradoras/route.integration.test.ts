// Integration (DB real) — FIX-61: CRUD de administradoras com assert de VALOR no DB.
// Skip se DATABASE_URL ausente/sentinel (padrão dos integration tests do repo).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// requireRole mockado: auth não é o foco aqui (guard tem teste estrutural próprio).
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: "test-admin" } },
	})),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function jsonReq(body: unknown) {
	return new Request("http://test/api/admin/administradoras", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb("FIX-61 — administradoras CRUD (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let GET: typeof import("./route").GET;
	let POST: typeof import("./route").POST;
	let PATCH: typeof import("./[id]/route").PATCH;
	let DELETE: typeof import("./[id]/route").DELETE;

	const createdIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ GET, POST } = await import("./route"));
		({ PATCH, DELETE } = await import("./[id]/route"));
		// idempotência: limpa resíduo de rodadas anteriores interrompidas
		const { inArray } = await import("drizzle-orm");
		await db
			.delete(schema.administradoras)
			.where(inArray(schema.administradoras.nome, ["Canopus Adm Teste", "Canopus Renomeada"]));
	});

	afterAll(async () => {
		for (const id of createdIds) {
			await db.delete(schema.administradoras).where(eq(schema.administradoras.id, id));
		}
	});

	it("cria administradora derivando o slug do nome (valor no DB)", async () => {
		const res = await POST(jsonReq({ nome: "Canopus Adm Teste", codigoBevi: "CANOPUS" }));
		expect(res.status).toBe(201);
		const row = (await res.json()) as { id: string; slug: string };
		createdIds.push(row.id);
		expect(row.slug).toBe("canopus-adm-teste");

		const inDb = await db
			.select()
			.from(schema.administradoras)
			.where(eq(schema.administradoras.id, row.id));
		expect(inDb).toHaveLength(1);
		expect(inDb[0].nome).toBe("Canopus Adm Teste");
		expect(inDb[0].codigoBevi).toBe("CANOPUS");
		expect(inDb[0].isActive).toBe(true);
	});

	it("lista inclui a administradora criada", async () => {
		const res = await GET();
		expect(res.status).toBe(200);
		const data = (await res.json()) as { administradoras: Array<{ id: string }> };
		expect(data.administradoras.some((a) => a.id === createdIds[0])).toBe(true);
	});

	it("rejeita nome duplicado com 409", async () => {
		const res = await POST(jsonReq({ nome: "Canopus Adm Teste" }));
		expect(res.status).toBe(409);
	});

	it("edita nome (regenera slug) e desativa", async () => {
		const id = createdIds[0];
		const res = await PATCH(
			new Request(`http://test/api/admin/administradoras/${id}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ nome: "Canopus Renomeada", isActive: false }),
			}),
			{ params: Promise.resolve({ id }) },
		);
		expect(res.status).toBe(200);

		const inDb = await db
			.select()
			.from(schema.administradoras)
			.where(eq(schema.administradoras.id, id));
		expect(inDb[0].nome).toBe("Canopus Renomeada");
		expect(inDb[0].slug).toBe("canopus-renomeada");
		expect(inDb[0].isActive).toBe(false);
	});

	it("remove (hard delete) a administradora", async () => {
		const id = createdIds[0];
		const res = await DELETE(new Request(`http://test/api/admin/administradoras/${id}`), {
			params: Promise.resolve({ id }),
		});
		expect(res.status).toBe(200);

		const inDb = await db
			.select()
			.from(schema.administradoras)
			.where(eq(schema.administradoras.id, id));
		expect(inDb).toHaveLength(0);
		createdIds.shift();
	});

	it("PATCH em id inexistente retorna 404", async () => {
		const res = await PATCH(
			new Request("http://test/api/admin/administradoras/00000000-0000-0000-0000-000000000000", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ nome: "Fantasma" }),
			}),
			{ params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) },
		);
		expect(res.status).toBe(404);
	});
});
