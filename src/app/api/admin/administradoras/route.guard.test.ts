// Camada 1 (structural) — guard de role nas rotas de administradoras.
// Assert contra o source de produção: toda rota mesa exige requireRole("admin").
// Regra de produto (FIX-61): a entidade é dossiê de operação interno — nenhuma
// rota pública a consome; só admin.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
	"src/app/api/admin/administradoras/route.ts",
	"src/app/api/admin/administradoras/[id]/route.ts",
];

describe("FIX-61 — guard estrutural das rotas de administradoras", () => {
	for (const rel of ROUTES) {
		it(`${rel} exige requireRole("admin")`, () => {
			const src = readFileSync(resolve(process.cwd(), rel), "utf8");
			expect(src).toContain('requireRole("admin")');
		});
	}
});
