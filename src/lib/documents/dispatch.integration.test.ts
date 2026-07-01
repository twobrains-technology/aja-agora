// Integration (DB real) — FIX-84: dispatchClientDocument é um CONSUMIDOR
// best-effort do documento guardado (FIX-82) — falha NUNCA perde/apaga o
// documento, só marca dispatchStatus=failed. bevi_a reusa uploadContractDocument
// (fulfillment.ts, mockado na fronteira); bevi_b é stub (PENDENTE-KAIRO);
// mesa é no-op manual. Storage mockado — não depende do MinIO estar de pé.
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	uploadContractDocumentMock: vi.fn(),
}));

vi.mock("@/lib/bevi/fulfillment", () => ({
	uploadContractDocument: mocks.uploadContractDocumentMock,
}));

vi.mock("@/lib/storage", () => ({
	putObject: vi.fn(async () => {}),
	getObject: vi.fn(async () => new Uint8Array([9, 9, 9])),
	deleteObject: vi.fn(async () => {}),
	ensureBucket: vi.fn(async () => {}),
	getSignedDownloadUrl: vi.fn(async () => "https://signed.example/x"),
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

describeIfDb("FIX-84 — dispatchClientDocument (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let dispatchClientDocument: typeof import("./dispatch").dispatchClientDocument;

	let conversationId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ dispatchClientDocument } = await import("./dispatch"));

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web" })
			.returning({ id: schema.conversations.id });
		conversationId = conv.id;
	});

	afterAll(async () => {
		await db.delete(schema.conversations).where(eq(schema.conversations.id, conversationId));
	});

	beforeEach(() => {
		mocks.uploadContractDocumentMock.mockReset();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	async function seedDoc() {
		const [doc] = await db
			.insert(schema.clientDocuments)
			.values({
				conversationId,
				slot: "identidade_frente",
				s3Bucket: "aja-client-docs-test",
				s3Key: `clients/${conversationId}/identidade_frente/x.jpg`,
				filename: "x.jpg",
				mimeType: "image/jpeg",
				sizeBytes: 3,
			})
			.returning({ id: schema.clientDocuments.id });
		return doc.id;
	}

	it('target="mesa": marca manual, dispatchedAt setado, sem chamar upload', async () => {
		const documentId = await seedDoc();
		const result = await dispatchClientDocument(documentId, "mesa");
		expect(result).toEqual({ documentId, dispatchStatus: "manual" });
		expect(mocks.uploadContractDocumentMock).not.toHaveBeenCalled();

		const [row] = await db
			.select()
			.from(schema.clientDocuments)
			.where(eq(schema.clientDocuments.id, documentId));
		expect(row.dispatchStatus).toBe("manual");
		expect(row.dispatchTarget).toBe("mesa");
		expect(row.dispatchedAt).not.toBeNull();
		expect(row.status).toBe("stored"); // o ativo continua guardado
	});

	it('target="bevi_b": STUB — marca pending, NÃO envia (PENDENTE-KAIRO)', async () => {
		const documentId = await seedDoc();
		const result = await dispatchClientDocument(documentId, "bevi_b");
		expect(result).toEqual({ documentId, dispatchStatus: "pending" });
		expect(mocks.uploadContractDocumentMock).not.toHaveBeenCalled();

		const [row] = await db
			.select()
			.from(schema.clientDocuments)
			.where(eq(schema.clientDocuments.id, documentId));
		expect(row.dispatchStatus).toBe("pending");
		expect(row.dispatchTarget).toBe("bevi_b");
		expect(row.dispatchedAt).toBeNull();
	});

	it('target="bevi_a" sucesso: reusa uploadContractDocument e marca sent', async () => {
		mocks.uploadContractDocumentMock.mockResolvedValueOnce({ ok: true });
		const documentId = await seedDoc();
		const result = await dispatchClientDocument(documentId, "bevi_a");
		expect(result).toEqual({ documentId, dispatchStatus: "sent" });
		expect(mocks.uploadContractDocumentMock).toHaveBeenCalledWith(
			conversationId,
			expect.objectContaining({ slot: "identidade_frente", filename: "x.jpg" }),
		);

		const [row] = await db
			.select()
			.from(schema.clientDocuments)
			.where(eq(schema.clientDocuments.id, documentId));
		expect(row.dispatchStatus).toBe("sent");
		expect(row.dispatchedAt).not.toBeNull();
	});

	it('target="bevi_a" falha (ok:false): marca failed SEM perder o documento', async () => {
		mocks.uploadContractDocumentMock.mockResolvedValueOnce({
			ok: false,
			fallbackLink: "https://conexia.example/up/abc",
		});
		const documentId = await seedDoc();
		const result = await dispatchClientDocument(documentId, "bevi_a");
		expect(result.dispatchStatus).toBe("failed");
		expect(result.error).toContain("conexia.example");

		const [row] = await db
			.select()
			.from(schema.clientDocuments)
			.where(eq(schema.clientDocuments.id, documentId));
		expect(row.dispatchStatus).toBe("failed");
		expect(row.status).toBe("stored"); // documento PERMANECE acessível
		expect(row.dispatchedAt).toBeNull();
	});

	it('target="bevi_a" exceção (ex.: sem BEVI_API_TOKEN): marca failed sem lançar pro chamador', async () => {
		mocks.uploadContractDocumentMock.mockRejectedValueOnce(
			new Error("BeviApiAdapter exige BEVI_API_TOKEN"),
		);
		const documentId = await seedDoc();
		const result = await dispatchClientDocument(documentId, "bevi_a");
		expect(result.dispatchStatus).toBe("failed");
		expect(result.error).toContain("BEVI_API_TOKEN");

		const [row] = await db
			.select()
			.from(schema.clientDocuments)
			.where(eq(schema.clientDocuments.id, documentId));
		expect(row.dispatchStatus).toBe("failed");
		expect(row.status).toBe("stored");
	});

	it("documento inexistente: lança erro claro (não é o caminho best-effort — chamador decide)", async () => {
		await expect(
			dispatchClientDocument("00000000-0000-0000-0000-000000000000", "bevi_a"),
		).rejects.toThrow(/não encontrado/);
	});
});
