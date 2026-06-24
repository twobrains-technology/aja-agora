// FIX-64 — Camada 1 (structural, roda em test:unit). Trava invariantes no source de
// produção: a rota de transbordo exige requireRole("admin") e o handoff resolve a
// administradora pela proposta. Nome NÃO começa com "route" de propósito (test:unit
// exclui route*.test.ts). Spec: docs/visao/mesa-de-operacao.md §4 + FIX-64.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("FIX-64 — guards estruturais do transbordo", () => {
	const routeSrc = readFileSync(
		join(process.cwd(), "src/app/api/admin/leads/[id]/transbordo/route.ts"),
		"utf8",
	);
	const handoffSrc = readFileSync(join(process.cwd(), "src/lib/mesa/handoff.ts"), "utf8");

	it('a rota POST exige requireRole("admin")', () => {
		expect(routeSrc).toContain('requireRole("admin")');
	});

	it("a rota é um handler POST", () => {
		expect(routeSrc).toMatch(/export\s+async\s+function\s+POST/);
	});

	it("o handoff resolve a administradora a partir da proposta (resolveAdministradoraId)", () => {
		expect(handoffSrc).toContain("resolveAdministradoraId");
		// casa por nome/código com a entidade administradoras
		expect(handoffSrc).toContain("administradoras");
		expect(handoffSrc).toContain("codigoBevi");
	});

	it("o handoff guarda a idempotência por handoff ativo", () => {
		expect(handoffSrc).toContain("handoff_ativo_existe");
	});
});
