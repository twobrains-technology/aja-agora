// Integration (DB real) — FIX-204: rotas admin de templates com assert de VALOR
// no DB. `createTemplate` (cliente Meta) é mockado — nunca batemos na Graph.
// Skip se DATABASE_URL ausente/sentinel (padrão dos integration tests do repo).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// requireRole mockado: auth tem teste estrutural próprio (templates-guard).
vi.mock("@/lib/admin/require-role", () => ({
	requireRole: vi.fn(async () => ({
		error: null,
		session: { user: { id: "test-admin", role: "admin" } },
	})),
}));

// Cliente Meta mockado — controlamos sucesso/erro por teste.
vi.mock("@/lib/whatsapp/api", () => ({
	createTemplate: vi.fn(),
}));

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

function postReq(body: unknown) {
	return new Request("http://test/api/admin/whatsapp/templates", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describeIfDb("FIX-204 — rotas de templates (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let GET: typeof import("./route").GET;
	let POST: typeof import("./route").POST;
	let PATCH: typeof import("./[id]/route").PATCH;
	let SUBMIT: typeof import("./[id]/submit/route").POST;
	let SYNC: typeof import("./sync/route").POST;
	let createTemplate: ReturnType<typeof vi.fn>;

	const createdIds: string[] = [];
	const NAMES = ["aja_it_confirmacao", "aja_it_resumo", "aja_it_semkey"];
	const KEYS = ["it_confirmacao_contratacao", "it_resumo_contratacao"];

	// beforeAll (não beforeEach): os testes acumulam estado ordenado (create →
	// submit → patch), como o padrão de integração de administradoras.
	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ GET, POST } = await import("./route"));
		({ PATCH } = await import("./[id]/route"));
		({ POST: SUBMIT } = await import("./[id]/submit/route"));
		({ POST: SYNC } = await import("./sync/route"));
		const api = await import("@/lib/whatsapp/api");
		createTemplate = api.createTemplate as ReturnType<typeof vi.fn>;
		createTemplate.mockReset();

		// idempotência: limpa resíduo de rodadas anteriores interrompidas
		const { inArray } = await import("drizzle-orm");
		await db
			.delete(schema.whatsappTemplates)
			.where(inArray(schema.whatsappTemplates.metaName, NAMES));
	});

	afterAll(async () => {
		for (const id of createdIds) {
			await db.delete(schema.whatsappTemplates).where(eq(schema.whatsappTemplates.id, id));
		}
	});

	it("POST cria um DRAFT com components/bodyPreview e usageKey null (opcional)", async () => {
		const res = await POST(
			postReq({
				metaName: "aja_it_semkey",
				category: "UTILITY",
				body: "Olá {{1}}, tudo certo!",
			}),
		);
		expect(res.status).toBe(201);
		const row = (await res.json()) as { id: string };
		createdIds.push(row.id);

		const [inDb] = await db
			.select()
			.from(schema.whatsappTemplates)
			.where(eq(schema.whatsappTemplates.id, row.id));
		expect(inDb.status).toBe("DRAFT");
		expect(inDb.usageKey).toBeNull();
		expect(inDb.metaTemplateId).toBeNull();
		expect(inDb.bodyPreview).toBe("Olá {{1}}, tudo certo!");
		expect(inDb.components?.some((c) => c.type === "BODY")).toBe(true);
	});

	it("POST com usageKey cria vinculado e GET lista", async () => {
		const res = await POST(
			postReq({
				usageKey: KEYS[0],
				metaName: "aja_it_confirmacao",
				category: "UTILITY",
				body: "Confirmado!",
			}),
		);
		expect(res.status).toBe(201);
		const row = (await res.json()) as { id: string; usageKey: string };
		createdIds.push(row.id);
		expect(row.usageKey).toBe(KEYS[0]);

		const listRes = await GET();
		const data = (await listRes.json()) as { templates: Array<{ id: string }> };
		expect(data.templates.some((t) => t.id === row.id)).toBe(true);
	});

	it("POST com usageKey duplicado → 409 (único quando setado)", async () => {
		const dup = await POST(
			postReq({ usageKey: KEYS[0], metaName: "aja_it_resumo", category: "UTILITY", body: "x" }),
		);
		expect(dup.status).toBe(409);
	});

	it("POST sem corpo → 400", async () => {
		const res = await POST(postReq({ metaName: "aja_it_resumo", category: "UTILITY" }));
		expect(res.status).toBe(400);
	});

	it("submit com sucesso → PENDING + metaTemplateId + submittedAt (assert no DB)", async () => {
		createTemplate.mockResolvedValueOnce({
			id: "meta-tmpl-xyz",
			status: "PENDING",
			category: "UTILITY",
		});
		const id = createdIds[0];

		const res = await SUBMIT(new Request("http://test"), { params: Promise.resolve({ id }) });
		expect(res.status).toBe(200);
		expect(createTemplate).toHaveBeenCalledTimes(1);

		const [inDb] = await db
			.select()
			.from(schema.whatsappTemplates)
			.where(eq(schema.whatsappTemplates.id, id));
		expect(inDb.status).toBe("PENDING");
		expect(inDb.metaTemplateId).toBe("meta-tmpl-xyz");
		expect(inDb.submittedAt).not.toBeNull();
		expect(inDb.rejectionReason).toBeNull();
	});

	it("submit já submetido (não-DRAFT) → 409", async () => {
		const id = createdIds[0]; // agora PENDING
		const res = await SUBMIT(new Request("http://test"), { params: Promise.resolve({ id }) });
		expect(res.status).toBe(409);
	});

	it("submit com falha da Meta → mantém DRAFT + grava erro, responde 502 (não PENDING falso)", async () => {
		createTemplate.mockRejectedValueOnce(new Error("createTemplate failed (400): nome inválido"));
		const id = createdIds[1]; // ainda DRAFT

		const res = await SUBMIT(new Request("http://test"), { params: Promise.resolve({ id }) });
		expect(res.status).toBe(502);

		const [inDb] = await db
			.select()
			.from(schema.whatsappTemplates)
			.where(eq(schema.whatsappTemplates.id, id));
		expect(inDb.status).toBe("DRAFT");
		expect(inDb.metaTemplateId).toBeNull();
		expect(inDb.rejectionReason).toContain("nome inválido");
	});

	it("PATCH rebind do usageKey é permitido mesmo fora de DRAFT (PENDING)", async () => {
		const id = createdIds[0]; // PENDING
		const res = await PATCH(
			new Request("http://test", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ usageKey: "it_rebind_novo" }),
			}),
			{ params: Promise.resolve({ id }) },
		);
		expect(res.status).toBe(200);
		const [inDb] = await db
			.select()
			.from(schema.whatsappTemplates)
			.where(eq(schema.whatsappTemplates.id, id));
		expect(inDb.usageKey).toBe("it_rebind_novo");
	});

	it("PATCH de conteúdo fora de DRAFT → 409", async () => {
		const id = createdIds[0]; // PENDING
		const res = await PATCH(
			new Request("http://test", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ body: "novo corpo" }),
			}),
			{ params: Promise.resolve({ id }) },
		);
		expect(res.status).toBe(409);
	});

	it("sync chama a reconciliação (stub) e responde ok", async () => {
		const res = await SYNC();
		expect(res.status).toBe(200);
		const data = (await res.json()) as { ok: boolean; updated: number };
		expect(data.ok).toBe(true);
		expect(data.updated).toBe(0);
	});
});
