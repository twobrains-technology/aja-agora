// Camada 1 (structural) — FIX-204: guard de role + SEAM nível 3 das rotas de
// templates. Assert contra o source de produção (roda em test:unit, sem DB).
// Regra de produto: gestão de templates é backoffice → só admin.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const BASE = "src/app/api/admin/whatsapp/templates";
const ROUTES = [
	`${BASE}/route.ts`,
	`${BASE}/[id]/route.ts`,
	`${BASE}/[id]/submit/route.ts`,
	`${BASE}/sync/route.ts`,
];

function read(rel: string) {
	return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("FIX-204 — guard estrutural das rotas de templates", () => {
	for (const rel of ROUTES) {
		it(`${rel} exige requireRole("admin")`, () => {
			expect(read(rel)).toContain('requireRole("admin")');
		});
	}
});

describe("FIX-204 — SEAM nível 3: rota /sync contra STUB do bloco-backend", () => {
	const src = read(`${BASE}/sync/route.ts`);

	it("chama reconcileTemplateStatuses()", () => {
		expect(src).toContain("reconcileTemplateStatuses(");
	});

	it("marca o TODO(bloco-backend) para troca do stub no merge", () => {
		expect(src).toContain("TODO(bloco-backend)");
	});

	it("usa STUB LOCAL, não importa template-sync (arquivo é do bloco-backend)", () => {
		// A função vive local no arquivo (stub)…
		expect(src).toMatch(/async function reconcileTemplateStatuses/);
		// …e NÃO há import real de template-sync (só a menção no comentário do seam).
		expect(src).not.toMatch(/^import[^\n]*template-sync/m);
	});
});

describe("FIX-204 — submit não finge sucesso quando a Meta falha", () => {
	const src = read(`${BASE}/[id]/submit/route.ts`);

	it("usa createTemplate do cliente Meta", () => {
		expect(src).toContain("createTemplate");
	});

	it("mantém DRAFT no catch (não persiste PENDING falso)", () => {
		// O bloco catch reverte/mantém DRAFT e grava o erro em rejectionReason.
		expect(src).toMatch(/catch[\s\S]*status:\s*"DRAFT"/);
		expect(src).toMatch(/catch[\s\S]*rejectionReason/);
	});
});
