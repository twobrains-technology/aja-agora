import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

describe("o aviso 'consultando as administradoras' reconhece a busca do vendedor livre", () => {
	it("buscar_cartas conta como busca", async () => {
		const { ehBuscaDeCartas } = await import("./adapter");
		expect(ehBuscaDeCartas("buscar_cartas")).toBe(true);
	});

	it("os nomes antigos da busca continuam contando", async () => {
		const { ehBuscaDeCartas } = await import("./adapter");
		expect(ehBuscaDeCartas("search_groups")).toBe(true);
		expect(ehBuscaDeCartas("recommend_groups")).toBe(true);
	});

	it("as outras tools não viram aviso de busca", async () => {
		const { ehBuscaDeCartas } = await import("./adapter");
		expect(ehBuscaDeCartas("fazer_proposta")).toBe(false);
		expect(ehBuscaDeCartas("mostrar_card")).toBe(false);
	});
});
