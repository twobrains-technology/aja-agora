// Camada 1 (structural) — FIX-191: schema de Message Templates da Meta.
//
// Bug-alvo: NÃO existe entidade de template no schema. Os status updates que a
// Meta manda pelo webhook são só logados; não há como cadastrar um template,
// acompanhar seu status até APPROVED, nem enfileirar mensagens business-initiated
// pendentes de aprovação. Ver docs/design/specs/2026-07-02-whatsapp-templates-meta-design.md.
//
// Este teste asserta a ESTRUTURA esperada contra o source do schema (não toca DB):
//   - tabela `whatsapp_templates` com as colunas da spec + enums status/category;
//   - `usageKey` é UNIQUE quando setado (unique index — NULLs distintos no PG);
//   - tabela `whatsapp_outbound_queue` (fila anti-manual) + enum de status;
//   - defaults corretos (status=DRAFT, language=pt_BR, queue status=pending, attempts=0).

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	whatsappOutboundQueue,
	whatsappOutboundStatusEnum,
	whatsappTemplateCategoryEnum,
	whatsappTemplates,
	whatsappTemplateStatusEnum,
} from "./schema";

describe("FIX-191 — enums de templates", () => {
	it("whatsappTemplateStatusEnum tem os 6 estados do ciclo Meta", () => {
		expect(whatsappTemplateStatusEnum.enumValues).toEqual([
			"DRAFT",
			"PENDING",
			"APPROVED",
			"REJECTED",
			"DISABLED",
			"PAUSED",
		]);
	});

	it("whatsappTemplateCategoryEnum tem as categorias da Meta", () => {
		expect(whatsappTemplateCategoryEnum.enumValues).toEqual([
			"UTILITY",
			"MARKETING",
			"AUTHENTICATION",
		]);
	});

	it("whatsappOutboundStatusEnum tem pending/sent/failed", () => {
		expect(whatsappOutboundStatusEnum.enumValues).toEqual(["pending", "sent", "failed"]);
	});
});

describe("FIX-191 — tabela whatsapp_templates", () => {
	const cfg = getTableConfig(whatsappTemplates);
	const cols = new Map(cfg.columns.map((c) => [c.name, c]));

	it("existe com as colunas da spec", () => {
		expect(cfg.name).toBe("whatsapp_templates");
		for (const name of [
			"id",
			"usage_key",
			"meta_name",
			"language",
			"category",
			"components",
			"body_preview",
			"status",
			"meta_template_id",
			"rejection_reason",
			"submitted_at",
			"approved_at",
			"last_synced_at",
			"created_at",
			"updated_at",
		]) {
			expect([...cols.keys()]).toContain(name);
		}
	});

	it("usage_key é UNIQUE quando setado (unique index, nullable)", () => {
		const usageKey = cols.get("usage_key");
		expect(usageKey?.notNull).toBe(false);
		const uniqueIdx = cfg.indexes.find(
			(i) => i.config.unique && i.config.columns.some((c) => (c as { name?: string }).name === "usage_key"),
		);
		expect(uniqueIdx).toBeDefined();
	});

	it("status default DRAFT e language default pt_BR", () => {
		expect(cols.get("status")?.default).toBe("DRAFT");
		expect(cols.get("language")?.default).toBe("pt_BR");
	});

	it("meta_name é NOT NULL (nome do template na Meta é obrigatório)", () => {
		expect(cols.get("meta_name")?.notNull).toBe(true);
	});
});

describe("FIX-191 — tabela whatsapp_outbound_queue", () => {
	const cfg = getTableConfig(whatsappOutboundQueue);
	const cols = new Map(cfg.columns.map((c) => [c.name, c]));

	it("existe com as colunas da fila anti-manual", () => {
		expect(cfg.name).toBe("whatsapp_outbound_queue");
		for (const name of [
			"id",
			"to",
			"usage_key",
			"params",
			"status",
			"attempts",
			"last_error",
			"created_at",
			"sent_at",
		]) {
			expect([...cols.keys()]).toContain(name);
		}
	});

	it("status default pending e attempts default 0", () => {
		expect(cols.get("status")?.default).toBe("pending");
		expect(cols.get("attempts")?.default).toBe(0);
	});

	it("to e usage_key são NOT NULL (não dá pra enfileirar sem destino/chave)", () => {
		expect(cols.get("to")?.notNull).toBe(true);
		expect(cols.get("usage_key")?.notNull).toBe(true);
	});
});
