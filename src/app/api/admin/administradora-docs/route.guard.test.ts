// Camada 1 (structural) — guard de role nas rotas de documentos da administradora.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
	"src/app/api/admin/administradora-docs/route.ts",
	"src/app/api/admin/administradora-docs/[id]/route.ts",
];

describe("FIX-62 — guard estrutural das rotas de documentos", () => {
	for (const rel of ROUTES) {
		it(`${rel} exige requireRole("admin")`, () => {
			const src = readFileSync(resolve(process.cwd(), rel), "utf8");
			expect(src).toContain('requireRole("admin")');
		});
	}
});
