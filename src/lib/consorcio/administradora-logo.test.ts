import { describe, expect, it } from "vitest";
import { buildAdministradoraLogoMap, matchAdministradoraLogo } from "./administradora-logo";

// FIX-222 (Ata 2026-07-04): logo da administradora no card. Assets reais são
// PENDENTE (sourcing/design) — este módulo é o pipeline puro (sem DB) que
// casa a administradora do grupo com o logo cadastrado, tolerante a
// acento/caixa (a Descoberta devolve "ÂNCORA", o cadastro pode ter "Ancora").

describe("buildAdministradoraLogoMap — normaliza nome (acento/caixa)", () => {
	it("indexa por nome normalizado, ignora linhas sem logoUrl", () => {
		const map = buildAdministradoraLogoMap([
			{ nome: "ÂNCORA", logoUrl: "https://cdn/ancora.png" },
			{ nome: "Rodobens", logoUrl: null },
		]);
		expect(map.get("ANCORA")).toBe("https://cdn/ancora.png");
		expect(map.has("RODOBENS")).toBe(false);
	});
});

describe("matchAdministradoraLogo — casa por nome, tolerante a acento/caixa", () => {
	const map = buildAdministradoraLogoMap([{ nome: "ÂNCORA", logoUrl: "https://cdn/ancora.png" }]);

	it("casa mesmo com caixa/acento diferentes da fonte", () => {
		expect(matchAdministradoraLogo(map, "ancora")).toBe("https://cdn/ancora.png");
		expect(matchAdministradoraLogo(map, "Ancora")).toBe("https://cdn/ancora.png");
	});

	it("sem match (administradora não cadastrada) → undefined, nunca fabrica", () => {
		expect(matchAdministradoraLogo(map, "BANCO DO BRASIL")).toBeUndefined();
	});

	it("sem logos (map ausente) ou sem administradora → undefined, sem quebrar", () => {
		expect(matchAdministradoraLogo(undefined, "ÂNCORA")).toBeUndefined();
		expect(matchAdministradoraLogo(map, undefined)).toBeUndefined();
	});
});
