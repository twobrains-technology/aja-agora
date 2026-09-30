// O recorte por variante do teste do telefone, nível CONVERSA, sem banco.
//
// O irmão `filtro-origem.test.ts` prova a FORMA do predicado; aqui a pergunta é
// a mesma para a variante: a allowlist não deixa passar valor desconhecido, a
// precedência é URL > cookie > todas, e `null` é resposta legítima ("todas as
// variantes") e nunca erro. O nível PESSOA (ancorado na identificação) é da B1b
// e não mora aqui.
//
// `toSQL()` monta a consulta sem executar: nenhuma conexão é aberta.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import {
	condicaoDeVarianteNaConversa,
	FILTROS_DE_VARIANTE,
	varianteDaConversaSql,
	varianteDaRequisicao,
} from "./filtro-variante";
import {
	COOKIE_DA_VARIANTE,
	lerFiltroDeVariante,
	OPCOES_DE_VARIANTE,
	rotuloDoRecorte,
	VARIANTE_SEM_VARIANTE,
} from "./filtro-variante-opcoes";

/** A consulta que a condição produz — texto e parâmetros, sem tocar o banco. */
function sqlDaCondicao(f: Parameters<typeof condicaoDeVarianteNaConversa>[0]) {
	const condicao = condicaoDeVarianteNaConversa(f);
	if (!condicao) throw new Error(`"${String(f)}" devia produzir condição`);
	return db.select().from(conversations).where(condicao).toSQL();
}

describe("lerFiltroDeVariante — allowlist", () => {
	it("aceita A, B e sem-variante", () => {
		expect(lerFiltroDeVariante("A")).toBe("A");
		expect(lerFiltroDeVariante("B")).toBe("B");
		expect(lerFiltroDeVariante("sem-variante")).toBe("sem-variante");
	});

	it("recusa qualquer coisa fora da allowlist, sem lançar", () => {
		for (const lixo of ["C", "a", "b", "", "todas", "x", null, undefined, 123, {}, []]) {
			expect(lerFiltroDeVariante(lixo)).toBeNull();
		}
	});

	it("o valor do balde sem variante é o que o resto do painel usa", () => {
		expect(VARIANTE_SEM_VARIANTE).toBe("sem-variante");
		expect(COOKIE_DA_VARIANTE).toBe("aja_variante");
	});
});

describe("rótulos — texto visível, com acento", () => {
	it("rotuloDoRecorte nomeia o recorte por extenso", () => {
		expect(rotuloDoRecorte("A")).toBe("Recorte: variante A");
		expect(rotuloDoRecorte("B")).toBe("Recorte: variante B");
		expect(rotuloDoRecorte("sem-variante")).toBe("Recorte: sem variante");
	});

	it("as opções do seletor são as quatro, com o rótulo exato", () => {
		expect(OPCOES_DE_VARIANTE).toEqual([
			{ valor: null, rotulo: "Todas as variantes" },
			{ valor: "A", rotulo: "Variante A — telefone antes das ofertas" },
			{ valor: "B", rotulo: "Variante B — ofertas embaçadas" },
			{ valor: "sem-variante", rotulo: "Sem variante" },
		]);
	});

	it("FILTROS_DE_VARIANTE carrega o default e os três recortes", () => {
		expect(FILTROS_DE_VARIANTE).toEqual(["todas", "A", "B", "sem-variante"]);
	});
});

describe("varianteDaRequisicao — URL > cookie > todas", () => {
	const daUrl = (url: string, cookie?: string) =>
		varianteDaRequisicao(
			new Request(url, cookie === undefined ? undefined : { headers: { cookie } }),
		);

	it("lê a querystring", () => {
		expect(daUrl("http://localhost/api/admin/x?variante=A")).toBe("A");
		expect(daUrl("http://localhost/api/admin/x?variante=sem-variante")).toBe("sem-variante");
	});

	it("a URL vence o cookie", () => {
		expect(daUrl("http://localhost/api/admin/x?variante=A", `${COOKIE_DA_VARIANTE}=B`)).toBe("A");
	});

	it("sem variante na URL, cai no cookie", () => {
		expect(daUrl("http://localhost/api/admin/x", `${COOKIE_DA_VARIANTE}=B`)).toBe("B");
	});

	it("sem URL e sem cookie, não filtra", () => {
		expect(daUrl("http://localhost/api/admin/x")).toBeNull();
	});

	it("valor inválido na URL não desce para o cookie — vira 'todas'", () => {
		expect(daUrl("http://localhost/api/admin/x?variante=C", `${COOKIE_DA_VARIANTE}=B`)).toBeNull();
	});

	it("cookie com `%` solto não derruba a leitura", () => {
		expect(() => daUrl("http://localhost/api/admin/x", `${COOKIE_DA_VARIANTE}=%`)).not.toThrow();
		expect(daUrl("http://localhost/api/admin/x", `${COOKIE_DA_VARIANTE}=%`)).toBeNull();
	});
});

describe("condicaoDeVarianteNaConversa — predicado no metadata", () => {
	it("sem filtro não gera SQL nenhum", () => {
		expect(condicaoDeVarianteNaConversa(null)).toBeNull();
	});

	it("A e B recortam por igualdade no metadata", () => {
		const a = condicaoDeVarianteNaConversa("A");
		expect(a).not.toBeNull();
		expect(a?.queryChunks.length).toBeGreaterThan(0);

		const recorteA = sqlDaCondicao("A");
		expect(recorteA.sql).toContain("->> 'variante'");
		expect(recorteA.params).toContain("telefoneDoDesbloqueio");
		expect(recorteA.params).toContain("A");

		const recorteB = sqlDaCondicao("B");
		expect(recorteB.params).toContain("B");
		expect(recorteB.params).not.toContain("A");
	});

	it("sem-variante pega NULL e valor fora da allowlist (a partição fecha)", () => {
		const { sql: texto, params } = sqlDaCondicao("sem-variante");

		// `not in ('A','B')` e não `is null`: um `"C"` gravado no metadata teria
		// que cair em `sem-variante`, senão `A + B + sem = todas` deixa de fechar.
		expect(texto).toContain("coalesce(");
		expect(texto).toContain("not in ('A', 'B')");
		expect(params).toContain("telefoneDoDesbloqueio");
	});

	it("a expressão da variante sai do metadata pela chave única", () => {
		const expressao = varianteDaConversaSql(sql`c`);
		const { params } = db.select().from(conversations).where(sql`${expressao} is not null`).toSQL();

		expect(params).toContain("telefoneDoDesbloqueio");
	});
});
