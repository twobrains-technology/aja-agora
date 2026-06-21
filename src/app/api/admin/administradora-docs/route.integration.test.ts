// Integration (DB real) — FIX-62: upload de doc PDF grava storage_key + extrai
// texto pro DB. Storage mockado na fronteira (ADR); extração de PDF roda de verdade.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeMinimalPdf } from "../../../../../tests/helpers/make-pdf";

const ADMIN_USER_ID = "test-admin-mesa-docs";

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: ADMIN_USER_ID } },
	})),
}));

// fronteira de storage mockada — não depende do MinIO estar de pé no `pnpm test`.
vi.mock("@/lib/storage", () => ({
	putObject: vi.fn(async () => {}),
	deleteObject: vi.fn(async () => {}),
	ensureBucket: vi.fn(async () => {}),
	getObject: vi.fn(async () => new Uint8Array()),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function uploadReq(
	fields: { administradoraId: string; titulo: string; tipo?: string },
	pdf: Uint8Array<ArrayBuffer>,
	filename = "manual.pdf",
) {
	const fd = new FormData();
	fd.set("administradoraId", fields.administradoraId);
	fd.set("titulo", fields.titulo);
	if (fields.tipo) fd.set("tipo", fields.tipo);
	fd.set("file", new File([pdf], filename, { type: "application/pdf" }));
	return new Request("http://test/api/admin/administradora-docs", { method: "POST", body: fd });
}

describeIfDb("FIX-62 — administradora-docs CRUD (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let storage: typeof import("@/lib/storage");
	let GET: typeof import("./route").GET;
	let POST: typeof import("./route").POST;
	let DELETE: typeof import("./[id]/route").DELETE;

	let administradoraId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		storage = await import("@/lib/storage");
		({ GET, POST } = await import("./route"));
		({ DELETE } = await import("./[id]/route"));

		// seed do usuário admin (FK uploaded_by) — idempotente
		await db.delete(schema.user).where(eq(schema.user.id, ADMIN_USER_ID));
		await db.insert(schema.user).values({
			id: ADMIN_USER_ID,
			name: "Test Admin Mesa",
			email: "test-admin-mesa-docs@example.com",
			role: "admin",
		});

		// seed da administradora dona dos docs — idempotente por nome
		const { inArray } = await import("drizzle-orm");
		await db
			.delete(schema.administradoras)
			.where(inArray(schema.administradoras.nome, ["Doc Test Adm"]));
		const [adm] = await db
			.insert(schema.administradoras)
			.values({ nome: "Doc Test Adm", slug: "doc-test-adm" })
			.returning();
		administradoraId = adm.id;
	});

	afterAll(async () => {
		// docs caem por cascade ao remover a administradora
		await db.delete(schema.administradoras).where(eq(schema.administradoras.id, administradoraId));
		await db.delete(schema.user).where(eq(schema.user.id, ADMIN_USER_ID));
	});

	it("faz upload: grava storage_key + extrai texto pro DB (assert de valor)", async () => {
		const pdf = makeMinimalPdf("MANUAL CANOPUS PROCEDIMENTO CONTRATACAO");
		const res = await POST(uploadReq({ administradoraId, titulo: "Manual de contratação" }, pdf));
		expect(res.status).toBe(201);
		const dto = (await res.json()) as { id: string; versao: number; temTexto: boolean };
		expect(dto.versao).toBe(1);
		expect(dto.temTexto).toBe(true);

		// storage foi chamado
		expect(storage.putObject).toHaveBeenCalledTimes(1);

		// valor no DB: storageKey setado + textoExtraido não-vazio com o conteúdo
		const [row] = await db
			.select()
			.from(schema.administradoraDocs)
			.where(eq(schema.administradoraDocs.id, dto.id));
		expect(row.storageKey).toMatch(/^administradora-docs\//);
		expect(row.storageKey.length).toBeGreaterThan(0);
		expect(row.textoExtraido).toBeTruthy();
		expect(row.textoExtraido ?? "").toContain("CANOPUS");
		expect(row.uploadedBy).toBe(ADMIN_USER_ID);
	});

	it("lista docs filtrando por administradoraId (sem expor storageKey/texto cru)", async () => {
		const res = await GET(
			new Request(`http://test/api/admin/administradora-docs?administradoraId=${administradoraId}`),
		);
		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			docs: Array<{ id: string; temTexto: boolean; storageKey?: string; textoExtraido?: string }>;
		};
		expect(data.docs.length).toBeGreaterThanOrEqual(1);
		expect(data.docs[0].temTexto).toBe(true);
		// DTO enxuto: nunca expõe storageKey nem textoExtraido cru
		expect(data.docs[0].storageKey).toBeUndefined();
		expect(data.docs[0].textoExtraido).toBeUndefined();
	});

	it("versiona: re-upload do mesmo título incrementa versao", async () => {
		const pdf = makeMinimalPdf("MANUAL CANOPUS V2");
		const res = await POST(uploadReq({ administradoraId, titulo: "Manual de contratação" }, pdf));
		expect(res.status).toBe(201);
		const dto = (await res.json()) as { versao: number };
		expect(dto.versao).toBe(2);
	});

	it("rejeita upload sem administradora existente (404)", async () => {
		const pdf = makeMinimalPdf("X");
		const res = await POST(
			uploadReq({ administradoraId: "00000000-0000-0000-0000-000000000000", titulo: "Órfão" }, pdf),
		);
		expect(res.status).toBe(404);
	});

	it("rejeita upload sem arquivo (400)", async () => {
		const fd = new FormData();
		fd.set("administradoraId", administradoraId);
		fd.set("titulo", "Sem arquivo");
		const res = await POST(
			new Request("http://test/api/admin/administradora-docs", { method: "POST", body: fd }),
		);
		expect(res.status).toBe(400);
	});

	it("remove o doc (DELETE) e limpa o storage", async () => {
		const pdf = makeMinimalPdf("PARA REMOVER");
		const created = (await (
			await POST(uploadReq({ administradoraId, titulo: "Doc temporário" }, pdf))
		).json()) as { id: string };

		const res = await DELETE(
			new Request(`http://test/api/admin/administradora-docs/${created.id}`),
			{ params: Promise.resolve({ id: created.id }) },
		);
		expect(res.status).toBe(200);
		expect(storage.deleteObject).toHaveBeenCalled();

		const rows = await db
			.select()
			.from(schema.administradoraDocs)
			.where(eq(schema.administradoraDocs.id, created.id));
		expect(rows).toHaveLength(0);
	});
});
