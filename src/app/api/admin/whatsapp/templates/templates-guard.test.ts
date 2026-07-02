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

describe("FIX-204 — SEAM nível 3: rota /sync usa a impl real de template-sync", () => {
	// Seam resolvido no merge da onda: o STUB local virou a implementação real
	// (`reconcileTemplateStatuses` em @/lib/whatsapp/template-sync). Este guard
	// reflete o estado pós-merge (antes cravava o stub/TODO, que já não existem).
	const src = read(`${BASE}/sync/route.ts`);

	it("chama reconcileTemplateStatuses()", () => {
		expect(src).toContain("reconcileTemplateStatuses(");
	});

	it("importa a impl real de template-sync (stub resolvido no merge)", () => {
		expect(src).toMatch(/^import[^\n]*template-sync/m);
		// e NÃO carrega mais um stub local nem o TODO de troca.
		expect(src).not.toMatch(/async function reconcileTemplateStatuses/);
		expect(src).not.toContain("TODO(bloco-backend)");
	});

	it("FIX-206: envolve a reconciliação em try/catch (502 acionável, não 500 mudo)", () => {
		expect(src).toMatch(/try\s*{[\s\S]*reconcileTemplateStatuses\(\)[\s\S]*catch/);
		expect(src).toMatch(/status:\s*502/);
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
