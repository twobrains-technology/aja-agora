// Integration (DB real) — FIX-83: download de documento de cliente gera URL
// pré-assinada + audit; sem sessão de admin → 401. Storage mockado na
// fronteira (não depende de MinIO estar de pé no `pnpm test`).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ADMIN_USER_ID = "test-admin-client-docs";
const SIGNED_URL = "https://signed.example/download/rg-frente.jpg";

const mocks = vi.hoisted(() => ({
	requireRoleMock: vi.fn(),
}));

vi.mock("@/lib/admin/require-role", () => ({
	requireRole: mocks.requireRoleMock,
}));

vi.mock("@/lib/storage", () => ({
	putObject: vi.fn(async () => {}),
	getObject: vi.fn(async () => new Uint8Array()),
	deleteObject: vi.fn(async () => {}),
	ensureBucket: vi.fn(async () => {}),
	getSignedDownloadUrl: vi.fn(async () => SIGNED_URL),
	getStorageConfig: vi.fn(() => ({
		region: "us-east-1",
		bucket: "aja-administradora-docs",
		forcePathStyle: true,
	})),
	getClientDocsStorageConfig: vi.fn(() => ({
		region: "us-east-1",
		bucket: "aja-client-docs-test",
		forcePathStyle: true,
	})),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("FIX-83 — download de documento de cliente (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let downloadGET: typeof import("./route").GET;
	let documentsGET: typeof import("../../../leads/[id]/documents/route").GET;

	let conversationId: string;
	let leadId: string;
	let documentId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ GET: downloadGET } = await import("./route"));
		({ GET: documentsGET } = await import("../../../leads/[id]/documents/route"));

		await db.delete(schema.user).where(eq(schema.user.id, ADMIN_USER_ID));
		await db.insert(schema.user).values({
			id: ADMIN_USER_ID,
			name: "Test Admin Client Docs",
			email: "test-admin-client-docs@example.com",
			role: "admin",
		});

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web" })
			.returning({ id: schema.conversations.id });
		conversationId = conv.id;

		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId, name: "Cliente Teste FIX-83" })
			.returning({ id: schema.leads.id });
		leadId = lead.id;

		const [doc] = await db
			.insert(schema.clientDocuments)
			.values({
				conversationId,
				leadId,
				slot: "identidade_frente",
				s3Bucket: "aja-client-docs-test",
				s3Key: `clients/${leadId}/identidade_frente/abc.jpg`,
				filename: "rg-frente.jpg",
				mimeType: "image/jpeg",
				sizeBytes: 1024,
			})
			.returning({ id: schema.clientDocuments.id });
		documentId = doc.id;
	});

	afterAll(async () => {
		await db.delete(schema.conversations).where(eq(schema.conversations.id, conversationId));
		await db.delete(schema.user).where(eq(schema.user.id, ADMIN_USER_ID));
	});

	it("sem sessão → 401 (não gera URL, não expõe nada)", async () => {
		mocks.requireRoleMock.mockResolvedValueOnce({
			error: Response.json({ error: "Unauthorized" }, { status: 401 }),
			session: null,
		});
		const res = await downloadGET(new Request("http://test"), {
			params: Promise.resolve({ id: documentId }),
		});
		expect(res.status).toBe(401);
	});

	it("admin autenticado → 200 com URL assinada + registra audit", async () => {
		mocks.requireRoleMock.mockResolvedValueOnce({
			error: null,
			session: { user: { id: ADMIN_USER_ID } },
		});
		const res = await downloadGET(new Request("http://test"), {
			params: Promise.resolve({ id: documentId }),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as { url: string };
		expect(data.url).toBe(SIGNED_URL);
		// nunca expõe bucket/key na resposta
		expect(JSON.stringify(data)).not.toMatch(/aja-client-docs-test|s3Key/);

		const downloads = await db
			.select()
			.from(schema.clientDocumentDownloads)
			.where(eq(schema.clientDocumentDownloads.clientDocumentId, documentId));
		expect(downloads).toHaveLength(1);
		expect(downloads[0].downloadedBy).toBe(ADMIN_USER_ID);
	});

	it("documento inexistente → 404", async () => {
		mocks.requireRoleMock.mockResolvedValueOnce({
			error: null,
			session: { user: { id: ADMIN_USER_ID } },
		});
		const res = await downloadGET(new Request("http://test"), {
			params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
		});
		expect(res.status).toBe(404);
	});

	it("listagem do lead: DTO enxuto (sem s3Bucket/s3Key), com o doc semeado", async () => {
		mocks.requireRoleMock.mockResolvedValueOnce({
			error: null,
			session: { user: { id: ADMIN_USER_ID } },
		});
		const res = await documentsGET(new Request("http://test"), {
			params: Promise.resolve({ id: leadId }),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as { documents: Array<Record<string, unknown>> };
		expect(data.documents).toHaveLength(1);
		expect(data.documents[0].id).toBe(documentId);
		expect(data.documents[0].filename).toBe("rg-frente.jpg");
		expect(data.documents[0].dispatchStatus).toBe("pending");
		expect(data.documents[0].s3Bucket).toBeUndefined();
		expect(data.documents[0].s3Key).toBeUndefined();
	});
});
