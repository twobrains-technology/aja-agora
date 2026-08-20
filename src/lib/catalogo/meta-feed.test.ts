import { describe, expect, it } from "vitest";

import { itensDoCatalogo } from "./itens";
import { CAMPOS_OBRIGATORIOS_META, feedMetaXml } from "./meta-feed";

/**
 * Verificador de boa-formação sem dependência nova: percorre as tags e prova
 * que toda abertura fecha na ordem. Não substitui um parser completo — prova o
 * que quebra na prática quando se monta XML com template string (tag órfã e
 * texto não escapado).
 */
function tagsBalanceadas(xml: string): boolean {
	const pilha: string[] = [];
	const tag = /<(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g;
	let m: RegExpExecArray | null = tag.exec(xml);
	while (m !== null) {
		const [, fecha, nome, resto, autoFecha] = m;
		if (!fecha && !autoFecha && !resto.endsWith("/")) pilha.push(nome);
		else if (fecha) {
			if (pilha.pop() !== nome) return false;
		}
		m = tag.exec(xml);
	}
	return pilha.length === 0;
}

describe("feedMetaXml", () => {
	const xml = feedMetaXml();

	it("é um RSS 2.0 com o namespace que a Meta exige", () => {
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
		expect(xml).toContain("</rss>");
	});

	it("fecha todas as tags que abre", () => {
		expect(tagsBalanceadas(xml)).toBe(true);
	});

	it("publica um <item> por carta do catálogo", () => {
		const quantos = xml.match(/<item>/g)?.length ?? 0;
		expect(quantos).toBe(itensDoCatalogo().length);
	});

	it("traz todos os campos obrigatórios em todos os itens", () => {
		const blocos = xml.split("<item>").slice(1);
		expect(blocos.length).toBeGreaterThan(0);
		for (const bloco of blocos) {
			for (const campo of CAMPOS_OBRIGATORIOS_META) {
				expect(bloco, `faltou g:${campo}`).toContain(`<g:${campo}>`);
			}
		}
	});

	it("formata o preço como a Meta lê: número e moeda ISO 4217", () => {
		const precos = xml.match(/<g:price>([^<]+)<\/g:price>/g) ?? [];
		expect(precos.length).toBeGreaterThan(0);
		for (const preco of precos) {
			expect(preco).toMatch(/<g:price>\d+\.\d{2} BRL<\/g:price>/);
		}
	});

	it("declara disponibilidade, condição e marca fixas", () => {
		expect(xml).toContain("<g:availability>in stock</g:availability>");
		expect(xml).toContain("<g:condition>new</g:condition>");
		expect(xml).toContain("<g:brand>Aja Agora</g:brand>");
	});

	it("escapa o & das UTMs no link — & cru quebra o parser da Meta", () => {
		expect(xml).toContain("&amp;utm_source=meta");
		// Nenhum & solto: todo & do documento tem que ser entidade.
		expect(xml.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/g)).toBeNull();
	});

	it("aceita uma lista própria de itens (para teste e para feed parcial)", () => {
		const [primeiro] = itensDoCatalogo();
		const so_um = feedMetaXml([primeiro]);
		expect(so_um.match(/<item>/g)).toHaveLength(1);
		expect(so_um).toContain(`<g:id>${primeiro.id}</g:id>`);
	});

	it("escapa caracteres especiais do texto", () => {
		const [base] = itensDoCatalogo();
		const xmlPerigoso = feedMetaXml([{ ...base, titulo: 'Carta <b>"5 & 6"</b>' }]);
		expect(xmlPerigoso).toContain("Carta &lt;b&gt;&quot;5 &amp; 6&quot;&lt;/b&gt;");
		expect(tagsBalanceadas(xmlPerigoso)).toBe(true);
	});
});
