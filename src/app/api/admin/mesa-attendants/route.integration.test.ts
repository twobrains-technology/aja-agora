// Integration (DB real) — FIX-63: CRUD de atendentes de mesa + whatsapp único.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({ error: null, session: { user: { id: "test-admin" } } })),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function jsonReq(body: unknown) {
	return new Request("http://test/api/admin/mesa-attendants", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb("FIX-63 — mesa-attendants CRUD (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let GET: typeof import("./route").GET;
	let POST: typeof import("./route").POST;
	let PATCH: typeof import("./[id]/route").PATCH;
	let DELETE: typeof import("./[id]/route").DELETE;

	const WHATSAPP = "5562988887777";
	const createdIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ GET, POST } = await import("./route"));
		({ PATCH, DELETE } = await import("./[id]/route"));
		// idempotência
		await db.delete(schema.mesaAttendants).where(eq(schema.mesaAttendants.whatsapp, WHATSAPP));
	});

	afterAll(async () => {
		for (const id of createdIds) {
			await db.delete(schema.mesaAttendants).where(eq(schema.mesaAttendants.id, id));
		}
	});

	it("cria atendente normalizando whatsapp pra E.164 (valor no DB)", async () => {
		const res = await POST(jsonReq({ nome: "João da Mesa", whatsapp: "(62) 98888-7777" }));
		expect(res.status).toBe(201);
		const row = (await res.json()) as { id: string; whatsapp: string };
		createdIds.push(row.id);
		expect(row.whatsapp).toBe(WHATSAPP);

		const inDb = await db
			.select()
			.from(schema.mesaAttendants)
			.where(eq(schema.mesaAttendants.id, row.id));
		expect(inDb).toHaveLength(1);
		expect(inDb[0].nome).toBe("João da Mesa");
		expect(inDb[0].whatsapp).toBe(WHATSAPP);
		expect(inDb[0].isActive).toBe(true);
	});

	it("lista inclui o atendente criado", async () => {
		const res = await GET();
		expect(res.status).toBe(200);
		const data = (await res.json()) as { mesaAttendants: Array<{ id: string }> };
		expect(data.mesaAttendants.some((a) => a.id === createdIds[0])).toBe(true);
	});

	it("rejeita whatsapp duplicado com 409 (mesmo número em outro formato)", async () => {
		const res = await POST(jsonReq({ nome: "Clone", whatsapp: "5562988887777" }));
		expect(res.status).toBe(409);
	});

	it("edita nome e desativa", async () => {
		const id = createdIds[0];
		const res = await PATCH(
			new Request(`http://test/api/admin/mesa-attendants/${id}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ nome: "João Renomeado", isActive: false }),
			}),
			{ params: Promise.resolve({ id }) },
		);
		expect(res.status).toBe(200);

		const inDb = await db
			.select()
			.from(schema.mesaAttendants)
			.where(eq(schema.mesaAttendants.id, id));
		expect(inDb[0].nome).toBe("João Renomeado");
		expect(inDb[0].isActive).toBe(false);
	});

	it("rejeita criação com whatsapp inválido (400)", async () => {
		const res = await POST(jsonReq({ nome: "Inválido", whatsapp: "123" }));
		expect(res.status).toBe(400);
	});

	it("remove (hard delete) o atendente", async () => {
		const id = createdIds[0];
		const res = await DELETE(new Request(`http://test/api/admin/mesa-attendants/${id}`), {
			params: Promise.resolve({ id }),
		});
		expect(res.status).toBe(200);
		const inDb = await db
			.select()
			.from(schema.mesaAttendants)
			.where(eq(schema.mesaAttendants.id, id));
		expect(inDb).toHaveLength(0);
		createdIds.shift();
	});
});
