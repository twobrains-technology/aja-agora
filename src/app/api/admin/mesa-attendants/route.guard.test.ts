// Camada 1 (structural) — guard de role nas rotas de atendentes de mesa.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
	"src/app/api/admin/mesa-attendants/route.ts",
	"src/app/api/admin/mesa-attendants/[id]/route.ts",
];

describe("FIX-63 — guard estrutural das rotas de atendentes de mesa", () => {
	for (const rel of ROUTES) {
		it(`${rel} exige requireRole("admin")`, () => {
			const src = readFileSync(resolve(process.cwd(), rel), "utf8");
			expect(src).toContain('requireRole("admin")');
		});
	}
});
