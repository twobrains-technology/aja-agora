// Camada 1 (structural) — aderência dos artifacts à paleta da marca.
// Trava a correção das cores hardcoded que NÃO herdam os tokens semânticos:
// contemplation-dial (emerald/amber/rose) e group-card (blue/green/orange/purple).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, f), "utf8");

describe("Artifacts — aderência à marca (sem cor Tailwind crua)", () => {
	it("contemplation-dial usa success/warning/destructive, não emerald/amber/rose", () => {
		const src = read("contemplation-dial.tsx");
		expect(src).toMatch(/text-success/);
		expect(src).toMatch(/text-warning/);
		expect(src).toMatch(/text-destructive/);
		expect(src).not.toMatch(/text-(emerald|amber|rose)-\d/);
	});

	it("group-card mapeia categorias aos tokens --cat-*, não a azul/verde/laranja/roxo crus", () => {
		const src = read("group-card.tsx");
		for (const cat of ["imovel", "auto", "moto", "servicos"]) {
			expect(src, `falta token cat-${cat}`).toMatch(new RegExp(`cat-${cat}`));
		}
		expect(src).not.toMatch(/bg-(blue|green|orange|purple)-500/);
	});
});
