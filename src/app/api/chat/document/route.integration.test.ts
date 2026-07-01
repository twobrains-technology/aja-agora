// Integration (DB real) — FIX-82: /api/chat/document grava no NOSSO S3
// (bucket dedicado de cliente, SSE-KMS) PRIMEIRO e responde {ok, documentId}
// SEM esperar o despacho à Bevi (isso virou dispatch.ts, FIX-84). Storage
// mockado na fronteira (ADR) — não depende do MinIO estar de pé no `pnpm test`.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const CLIENT_DOCS_BUCKET = "aja-client-docs-test";

vi.mock("@/lib/storage", () => ({
	putObject: vi.fn(async () => {}),
	getObject: vi.fn(async () => new Uint8Array([1, 2, 3])),
	deleteObject: vi.fn(async () => {}),
	ensureBucket: vi.fn(async () => {}),
	getSignedDownloadUrl: vi.fn(async () => "https://signed.example/download"),
	getStorageConfig: vi.fn(() => ({
		region: "us-east-1",
		bucket: "aja-administradora-docs",
		forcePathStyle: true,
	})),
	getClientDocsStorageConfig: vi.fn(() => ({
		region: "us-east-1",
		bucket: CLIENT_DOCS_BUCKET,
		forcePathStyle: true,
	})),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function uploadReq(body: Record<string, unknown>) {
	return new Request("http://test/api/chat/document", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb("FIX-82 — /api/chat/document (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let storage: typeof import("@/lib/storage");
	let POST: typeof import("./route").POST;

	let conversationId: string;
	let leadId: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		storage = await import("@/lib/storage");
		({ POST } = await import("./route"));

		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web" })
			.returning({ id: schema.conversations.id });
		conversationId = conv.id;

		const [lead] = await db
			.insert(schema.leads)
			.values({ conversationId, name: "Cliente Teste FIX-82" })
			.returning({ id: schema.leads.id });
		leadId = lead.id;
	});

	afterAll(async () => {
		await db.delete(schema.conversations).where(eq(schema.conversations.id, conversationId));
	});

	it("grava no bucket DEDICADO de cliente + insere client_documents (status=stored, dispatch=pending)", async () => {
		const res = await POST(
			uploadReq({
				conversationId,
				slot: "identidade_frente",
				fileBase64: Buffer.from("conteudo-fake-do-rg").toString("base64"),
				filename: "rg-frente.jpg",
				mimeType: "image/jpeg",
			}),
		);
		expect(res.status).toBe(200);
		const data = (await res.json()) as { ok: boolean; documentId: string };
		expect(data.ok).toBe(true);
		expect(data.documentId).toBeTruthy();

		// storage chamado no bucket de CLIENTE, nunca no de administradora
		expect(storage.putObject).toHaveBeenCalledTimes(1);
		const [key, , , cfg] = vi.mocked(storage.putObject).mock.calls[0];
		expect(key).toMatch(new RegExp(`^clients/${leadId}/identidade_frente/`));
		expect(cfg).toMatchObject({ bucket: CLIENT_DOCS_BUCKET });

		const [row] = await db
			.select()
			.from(schema.clientDocuments)
			.where(eq(schema.clientDocuments.id, data.documentId));
		expect(row.status).toBe("stored");
		expect(row.dispatchStatus).toBe("pending");
		expect(row.dispatchTarget).toBeNull();
		expect(row.s3Bucket).toBe(CLIENT_DOCS_BUCKET);
		expect(row.leadId).toBe(leadId);
		expect(row.conversationId).toBe(conversationId);
		expect(row.filename).toBe("rg-frente.jpg");
	});

	it("resolve leadId=null quando ainda não existe lead pra conversa", async () => {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web" })
			.returning({ id: schema.conversations.id });

		const res = await POST(
			uploadReq({
				conversationId: conv.id,
				slot: "comprovante_endereco",
				fileBase64: Buffer.from("comprovante-fake").toString("base64"),
				filename: "comprovante.pdf",
				mimeType: "application/pdf",
			}),
		);
		expect(res.status).toBe(200);
		const data = (await res.json()) as { documentId: string };

		const [row] = await db
			.select()
			.from(schema.clientDocuments)
			.where(eq(schema.clientDocuments.id, data.documentId));
		expect(row.leadId).toBeNull();

		await db.delete(schema.conversations).where(eq(schema.conversations.id, conv.id));
	});

	it("rejeita payload inválido (400) sem tocar o storage", async () => {
		vi.mocked(storage.putObject).mockClear();
		const res = await POST(uploadReq({ conversationId, slot: "slot-invalido" }));
		expect(res.status).toBe(400);
		expect(storage.putObject).not.toHaveBeenCalled();
	});

	it("rejeita arquivo vazio (400)", async () => {
		const res = await POST(
			uploadReq({
				conversationId,
				slot: "identidade_frente",
				fileBase64: "",
				filename: "vazio.jpg",
				mimeType: "image/jpeg",
			}),
		);
		expect(res.status).toBe(400);
	});

	it("rejeita conversationId inexistente (FK) sem derrubar o processo — 422", async () => {
		const res = await POST(
			uploadReq({
				conversationId: randomUUID(),
				slot: "identidade_frente",
				fileBase64: Buffer.from("x").toString("base64"),
				filename: "x.jpg",
				mimeType: "image/jpeg",
			}),
		);
		expect(res.status).toBe(422);
		const data = (await res.json()) as { ok: boolean };
		expect(data.ok).toBe(false);
	});
});
