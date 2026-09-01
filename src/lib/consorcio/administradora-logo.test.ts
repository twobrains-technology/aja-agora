import { describe, expect, it } from "vitest";
import {
	buildAdministradoraLogoMap,
	logoLocalDaAdministradora,
	matchAdministradoraLogo,
} from "./administradora-logo";

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

	// Estes dois casos usavam "BANCO DO BRASIL" e "ÂNCORA" como exemplos de
	// "não cadastrado" porque, quando foram escritos, NENHUMA administradora
	// tinha asset. Agora as duas têm (public/administradoras/) e cairiam no
	// piso local — o exemplo mudou para uma administradora que a Bevi não opera.
	// A garantia protegida é a mesma: sem cadastro E sem asset, nunca fabrica.
	it("sem match (nem cadastro, nem asset versionado) → undefined, nunca fabrica", () => {
		expect(matchAdministradoraLogo(map, "EMBRACON")).toBeUndefined();
	});

	it("sem logos (map ausente) ou sem administradora → undefined, sem quebrar", () => {
		expect(matchAdministradoraLogo(undefined, "EMBRACON")).toBeUndefined();
		expect(matchAdministradoraLogo(map, undefined)).toBeUndefined();
	});
});

// ─── FIX-222, fecho: os assets deixaram de ser PENDENTE ──────────────────────
// Os 7 SVGs das administradoras da Bevi agora são versionados em
// `public/administradoras/`. Isso resolve o furo que travava o FIX-222: a rota
// admin (`/api/admin/administradoras`) nunca aceitou `logoUrl`, então NÃO havia
// caminho para cadastrar logo nenhum — o pipeline existia e nunca podia rodar.
// O banco continua tendo precedência (override por administradora nova ou arte
// trocada); o asset local é o piso, e a regra "nunca fabrica logo" continua de
// pé: nome fora da lista → undefined → fallback de iniciais.
describe("logoLocalDaAdministradora — asset versionado por nome", () => {
	it("casa as 4 que aparecem no comparador, tolerante a acento/caixa", () => {
		expect(logoLocalDaAdministradora("ITAÚ")).toBe("/administradoras/itau.svg");
		expect(logoLocalDaAdministradora("ÂNCORA")).toBe("/administradoras/ancora.svg");
		expect(logoLocalDaAdministradora("BANCO DO BRASIL")).toBe(
			"/administradoras/banco-do-brasil.svg",
		);
		expect(logoLocalDaAdministradora("rodobens")).toBe("/administradoras/rodobens.svg");
	});

	it("casa as outras 3 da Bevi, que ainda não apareceram mas podem aparecer", () => {
		expect(logoLocalDaAdministradora("CANOPUS")).toBe("/administradoras/canopus.svg");
		expect(logoLocalDaAdministradora("CONSÓRCIO TRADIÇÃO")).toBe("/administradoras/tradicao.svg");
		expect(logoLocalDaAdministradora("Consórcio Servopa")).toBe("/administradoras/servopa.svg");
	});

	it("casa quando o nome vem com o sufixo da Bevi (o nome do cadastro varia)", () => {
		expect(logoLocalDaAdministradora("ÂNCORA CONSÓRCIOS")).toBe("/administradoras/ancora.svg");
		expect(logoLocalDaAdministradora("BB CONSÓRCIOS")).toBe("/administradoras/banco-do-brasil.svg");
		expect(logoLocalDaAdministradora("ITAÚ CONSÓRCIO")).toBe("/administradoras/itau.svg");
	});

	it("administradora fora da lista → undefined (fallback de iniciais, nunca chuta um path)", () => {
		expect(logoLocalDaAdministradora("EMBRACON")).toBeUndefined();
		expect(logoLocalDaAdministradora("PORTO SEGURO")).toBeUndefined();
		expect(logoLocalDaAdministradora("")).toBeUndefined();
		expect(logoLocalDaAdministradora(undefined)).toBeUndefined();
	});

	it("token curto não casa por substring — 'BB' dentro de outra palavra é falso positivo", () => {
		expect(logoLocalDaAdministradora("ABBCON")).toBeUndefined();
	});
});

describe("matchAdministradoraLogo — banco tem precedência, asset local é o piso", () => {
	it("sem cadastro no banco, cai no asset versionado (é o caso de hoje)", () => {
		expect(matchAdministradoraLogo(new Map(), "ITAÚ")).toBe("/administradoras/itau.svg");
		expect(matchAdministradoraLogo(undefined, "RODOBENS")).toBe("/administradoras/rodobens.svg");
	});

	it("com logoUrl cadastrado, o banco vence (permite trocar a arte sem deploy)", () => {
		const map = buildAdministradoraLogoMap([
			{ nome: "ITAÚ", logoUrl: "https://cdn/itau-novo.svg" },
		]);
		expect(matchAdministradoraLogo(map, "ITAÚ")).toBe("https://cdn/itau-novo.svg");
	});

	it("nem banco nem asset → undefined", () => {
		expect(matchAdministradoraLogo(new Map(), "EMBRACON")).toBeUndefined();
	});
});
