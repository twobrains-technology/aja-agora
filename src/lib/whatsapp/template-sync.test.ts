// Camada 1 (integração, DB real) — FIX-202: sync de status de templates.
//
// Bug-alvo: o webhook só trata `messages`/`statuses`; status de template
// (`message_template_status_update`) é ignorado e não há poll. Um template
// submetido nunca sai de PENDING no nosso lado sem refresh manual, e a fila de
// confirmações (FIX-201) nunca é esvaziada ao aprovar.
//
// Estratégia: DB real (whatsapp_templates) + `listTemplates` (Graph) e
// `flushOutboundQueue` (FIX-201) mockados. Assere a transição de status local e o
// disparo do flush ao virar APPROVED. Env-gated (pula sem DB real).
// Ver docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	listTemplates: vi.fn(),
	flushOutboundQueue: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }),
}));

vi.mock("./api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./api")>();
	return { ...actual, listTemplates: mocks.listTemplates };
});
vi.mock("./template-dispatch", () => ({ flushOutboundQueue: mocks.flushOutboundQueue }));

import { db } from "@/db";
import { whatsappTemplates } from "@/db/schema";
import {
	applyTemplateStatusUpdate,
	mapMetaEventToStatus,
	parseTemplateStatusChange,
	reconcileTemplateStatuses,
} from "./template-sync";

const RUN = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("test_sentinel");

const createdIds: string[] = [];

async function makeTemplate(opts: {
	usageKey?: string | null;
	metaName: string;
	metaTemplateId?: string | null;
	status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";
}): Promise<string> {
	const [row] = await db
		.insert(whatsappTemplates)
		.values({
			usageKey: opts.usageKey ?? null,
			metaName: opts.metaName,
			metaTemplateId: opts.metaTemplateId ?? null,
			language: "pt_BR",
			status: opts.status,
		})
		.returning({ id: whatsappTemplates.id });
	createdIds.push(row.id);
	return row.id;
}

async function reload(id: string) {
	const [row] = await db.select().from(whatsappTemplates).where(eq(whatsappTemplates.id, id));
	return row;
}

beforeEach(() => {
	mocks.listTemplates.mockReset();
	mocks.flushOutboundQueue.mockReset().mockResolvedValue({ sent: 0, failed: 0 });
});

afterEach(async () => {
	for (const id of createdIds.splice(0)) {
		await db.delete(whatsappTemplates).where(eq(whatsappTemplates.id, id));
	}
});

describe("FIX-202 — parseTemplateStatusChange (puro)", () => {
	it("normaliza os campos do value do webhook", () => {
		const change = parseTemplateStatusChange({
			event: "APPROVED",
			message_template_id: "12345",
			message_template_name: "aja_confirmacao_v1",
			message_template_language: "pt_BR",
			reason: null,
		});
		expect(change).toEqual({
			event: "APPROVED",
			metaTemplateId: "12345",
			metaName: "aja_confirmacao_v1",
			language: "pt_BR",
			reason: null,
		});
	});

	it("value vazio → tudo null/vazio (não quebra)", () => {
		expect(parseTemplateStatusChange(undefined)).toEqual({
			event: "",
			metaTemplateId: null,
			metaName: null,
			language: null,
			reason: null,
		});
	});
});

describe("FIX-202 — mapMetaEventToStatus", () => {
	it("mapeia eventos conhecidos e ignora desconhecidos", () => {
		expect(mapMetaEventToStatus("APPROVED")).toBe("APPROVED");
		expect(mapMetaEventToStatus("REJECTED")).toBe("REJECTED");
		expect(mapMetaEventToStatus("PAUSED")).toBe("PAUSED");
		expect(mapMetaEventToStatus("DISABLED")).toBe("DISABLED");
		expect(mapMetaEventToStatus("PENDING_DELETION")).toBeNull();
		expect(mapMetaEventToStatus(undefined)).toBeNull();
	});
});

describe.skipIf(!RUN)("FIX-202 — applyTemplateStatusUpdate", () => {
	it("APPROVED → status=APPROVED, approvedAt/lastSyncedAt setados, flush(usageKey)", async () => {
		const id = await makeTemplate({
			usageKey: "confirmacao_contratacao",
			metaName: "aja_confirmacao_v1",
			metaTemplateId: "meta-1",
			status: "PENDING",
		});

		const res = await applyTemplateStatusUpdate(
			parseTemplateStatusChange({
				event: "APPROVED",
				message_template_id: "meta-1",
				message_template_name: "aja_confirmacao_v1",
			}),
		);

		expect(res).toMatchObject({ updated: true, flushed: true, usageKey: "confirmacao_contratacao" });
		const row = await reload(id);
		expect(row.status).toBe("APPROVED");
		expect(row.approvedAt).toBeTruthy();
		expect(row.lastSyncedAt).toBeTruthy();
		expect(mocks.flushOutboundQueue).toHaveBeenCalledWith("confirmacao_contratacao");
	});

	it("REJECTED → status=REJECTED + rejectionReason, NÃO flusha", async () => {
		const id = await makeTemplate({
			usageKey: "resumo_contratacao",
			metaName: "aja_resumo_v1",
			metaTemplateId: "meta-2",
			status: "PENDING",
		});

		const res = await applyTemplateStatusUpdate(
			parseTemplateStatusChange({
				event: "REJECTED",
				message_template_id: "meta-2",
				reason: "INVALID_FORMAT: placeholder mismatch",
			}),
		);

		expect(res).toMatchObject({ updated: true, flushed: false });
		const row = await reload(id);
		expect(row.status).toBe("REJECTED");
		expect(row.rejectionReason).toContain("INVALID_FORMAT");
		expect(mocks.flushOutboundQueue).not.toHaveBeenCalled();
	});

	it("template desconhecido localmente → não cria linha órfã, não flusha", async () => {
		const res = await applyTemplateStatusUpdate(
			parseTemplateStatusChange({
				event: "APPROVED",
				message_template_id: "nao-existe",
				message_template_name: "fantasma",
			}),
		);
		expect(res).toEqual({ updated: false, reason: "unknown_template" });
		expect(mocks.flushOutboundQueue).not.toHaveBeenCalled();
		const rows = await db
			.select()
			.from(whatsappTemplates)
			.where(eq(whatsappTemplates.metaName, "fantasma"));
		expect(rows).toHaveLength(0);
	});

	it("casa por metaName quando só o nome vem (grava o metaTemplateId)", async () => {
		const id = await makeTemplate({
			usageKey: "proposta_pronta",
			metaName: "aja_proposta_v1",
			metaTemplateId: null,
			status: "PENDING",
		});
		await applyTemplateStatusUpdate(
			parseTemplateStatusChange({
				event: "APPROVED",
				message_template_name: "aja_proposta_v1",
				message_template_id: "meta-late-3",
			}),
		);
		const row = await reload(id);
		expect(row.status).toBe("APPROVED");
		expect(row.metaTemplateId).toBe("meta-late-3");
	});
});

describe.skipIf(!RUN)("FIX-202 — reconcileTemplateStatuses (poll)", () => {
	it("status divergente (PENDING local, APPROVED remoto) → atualiza e flusha", async () => {
		const id = await makeTemplate({
			usageKey: "confirmacao_reconc",
			metaName: "aja_reconc_v1",
			metaTemplateId: "rid-1",
			status: "PENDING",
		});
		mocks.listTemplates.mockResolvedValue([
			{ id: "rid-1", name: "aja_reconc_v1", status: "APPROVED", language: "pt_BR" },
		]);

		const res = await reconcileTemplateStatuses();

		expect(res.updated).toBe(1);
		expect(res.flushed).toContain("confirmacao_reconc");
		expect(await reload(id).then((r) => r.status)).toBe("APPROVED");
		expect(mocks.flushOutboundQueue).toHaveBeenCalledWith("confirmacao_reconc");
	});

	it("sem divergência (já APPROVED) → não conta updated nem flusha", async () => {
		await makeTemplate({
			usageKey: "confirmacao_igual",
			metaName: "aja_igual_v1",
			metaTemplateId: "rid-2",
			status: "APPROVED",
		});
		mocks.listTemplates.mockResolvedValue([
			{ id: "rid-2", name: "aja_igual_v1", status: "APPROVED", language: "pt_BR" },
		]);

		const res = await reconcileTemplateStatuses();

		expect(res.updated).toBe(0);
		expect(res.flushed).toHaveLength(0);
		expect(mocks.flushOutboundQueue).not.toHaveBeenCalled();
	});
});
