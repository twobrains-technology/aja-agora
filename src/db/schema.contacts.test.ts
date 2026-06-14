// Camada 1 (structural) — FIX-41: entidade `contacts` (cliente unificado).
//
// Bug-alvo: NÃO existe entidade cliente. `leads` é 1:1 com `conversation`, sem
// índice em phone/email; CPF cifrado e não pesquisável. Mesmo cliente em web +
// WhatsApp = dois leads separados no kanban.
//
// Este teste asserta a ESTRUTURA esperada contra o source do schema (não toca DB):
//   - tabela `contacts` com colunas phone/cpf/email/name + timestamps (nullable);
//   - índices contacts_phone_idx / contacts_cpf_idx / contacts_email_idx;
//   - invariante ≥1 identificador (check constraint);
//   - FKs contactId em conversations / leads / bevi_proposals;
//   - índice leads_phone_idx (consulta legada por telefone).

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { beviProposals, contacts, conversations, leads } from "./schema";

describe("FIX-41 — tabela contacts", () => {
	const cfg = getTableConfig(contacts);
	const colNames = cfg.columns.map((c) => c.name);

	it("existe com colunas id/phone/cpf/email/name + timestamps", () => {
		expect(cfg.name).toBe("contacts");
		for (const col of ["id", "phone", "cpf", "email", "name", "created_at", "updated_at"]) {
			expect(colNames).toContain(col);
		}
	});

	it("identificadores são nullable (phone/cpf/email)", () => {
		for (const name of ["phone", "cpf", "email"]) {
			const col = cfg.columns.find((c) => c.name === name);
			expect(col?.notNull).toBe(false);
		}
	});

	it("tem índices pesquisáveis em phone/cpf/email", () => {
		const idxNames = cfg.indexes.map((i) => i.config.name);
		expect(idxNames).toContain("contacts_phone_idx");
		expect(idxNames).toContain("contacts_cpf_idx");
		expect(idxNames).toContain("contacts_email_idx");
	});

	it("invariante ≥1 identificador presente (check constraint)", () => {
		// pelo menos um de phone/cpf/email não-nulo, expresso por check constraint.
		const checkNames = cfg.checks.map((c) => c.name);
		expect(checkNames).toContain("contacts_identifier_check");
		// O check referencia as 3 colunas identificadoras (queryChunks carrega
		// objetos Column com `.name`).
		const check = cfg.checks.find((c) => c.name === "contacts_identifier_check");
		const referenced = (check?.value.queryChunks ?? [])
			.map((chunk) => (chunk as { name?: string }).name)
			.filter(Boolean);
		expect(referenced).toEqual(expect.arrayContaining(["phone", "cpf", "email"]));
	});
});

describe("FIX-41 — FKs contactId nos consumidores", () => {
	it("conversations.contactId existe e referencia contacts", () => {
		const cfg = getTableConfig(conversations);
		expect(cfg.columns.map((c) => c.name)).toContain("contact_id");
		const fk = cfg.foreignKeys.find((f) =>
			f.reference().columns.some((c) => c.name === "contact_id"),
		);
		expect(fk?.reference().foreignTable).toBe(contacts);
	});

	it("leads.contactId existe + índice leads_phone_idx (consulta legada)", () => {
		const cfg = getTableConfig(leads);
		expect(cfg.columns.map((c) => c.name)).toContain("contact_id");
		expect(cfg.indexes.map((i) => i.config.name)).toContain("leads_phone_idx");
	});

	it("bevi_proposals.contactId existe (denormaliza p/ consulta direta)", () => {
		const cfg = getTableConfig(beviProposals);
		expect(cfg.columns.map((c) => c.name)).toContain("contact_id");
	});
});
