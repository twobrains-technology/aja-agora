// Camada 1 (structural) — aderência dos artifacts à paleta da marca.
// Trava a correção das cores hardcoded que NÃO herdam os tokens semânticos:
// contemplation-dial (emerald/amber/rose) e group-card (blue/green/orange/purple).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8");

describe("Artifacts — aderência à marca (sem cor Tailwind crua)", () => {
	it("contemplation-dial não usa cor Tailwind crua emerald/amber/rose", () => {
		// FIX-231: o medidor de chance (que usava text-success/warning/destructive)
		// foi removido — consumia `likelihood`, heurística sem dado real que a
		// sustente (docs/05-compliance-e-dados.md). A regra de "não usar cor crua"
		// segue valendo pro que resta no arquivo.
		const src = read("contemplation-dial.tsx");
		expect(src).not.toMatch(/text-(emerald|amber|rose)-\d/);
	});

	it("group-card mapeia categorias aos tokens --cat-*, não a azul/verde/laranja/roxo crus", () => {
		const src = read("group-card.tsx");
		// FIX-363: "servicos" foi removida do enum de categorias (nunca mais
		// oferecida em nenhum canal) — a lista aqui reflete as categorias vivas.
		for (const cat of ["imovel", "auto", "moto"]) {
			expect(src, `falta token cat-${cat}`).toMatch(new RegExp(`cat-${cat}`));
		}
		expect(src).not.toMatch(/bg-(blue|green|orange|purple)-500/);
	});
});
