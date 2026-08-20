import { describe, expect, it } from "vitest";

import { itensDoCatalogo } from "@/lib/catalogo/itens";

import { GET } from "./route";

describe("GET /feed/meta.xml", () => {
	it("responde XML com o charset declarado", async () => {
		const resposta = GET();
		expect(resposta.status).toBe(200);
		expect(resposta.headers.get("content-type")).toBe("application/xml; charset=utf-8");
	});

	it("entrega o catálogo inteiro", async () => {
		const corpo = await GET().text();
		expect(corpo).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
		expect(corpo.match(/<item>/g)).toHaveLength(itensDoCatalogo().length);
	});

	it("pode ser cacheado — a Meta busca em horário agendado", async () => {
		expect(GET().headers.get("cache-control")).toContain("max-age");
	});
});
