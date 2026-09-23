/**
 * O CONTRATO dos dois cortes de conversa que as telas de medição compartilham.
 *
 * Por que isto existe: `conversaAtribuida` nasceu local a `performance-queries.ts`
 * e a tela de Campanhas passou a precisar do mesmo recorte (o complemento) para
 * declarar as conversas que ficam fora do funil. Duas telas com duas definições
 * de "conversa do funil" divergem no primeiro dia, com o mesmo rótulo — e o
 * defeito aparece como um número que não fecha com a lista logo abaixo dele.
 *
 * Não é teste de banco: é o contrato do fragmento (quais condições ele carrega e
 * que ele não cola num alias fixo). A prova contra dado real é a integração de
 * `performance-queries` e `campanhas-queries`.
 */

import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	contagensDoFunil,
	conversaAtribuida,
	conversaIdentificada,
	conversaSemOrigem,
	leadComContato,
	leadIdentificado,
} from "./sinais-do-funil";

const dialect = new PgDialect();
const de = new Date("2026-09-01T00:00:00-03:00");
const ate = new Date("2026-09-22T23:59:59-03:00");

function texto(fragmento: ReturnType<typeof conversaAtribuida>) {
	return dialect.sqlToQuery(fragmento).sql.replace(/\s+/g, " ").trim();
}

describe("conversaAtribuida", () => {
	it("exige conversa não simulada, com visita, dentro da janela", () => {
		const q = dialect.sqlToQuery(conversaAtribuida(de, ate));
		expect(q.sql).toContain("is_simulated = false");
		expect(q.sql).toContain("visit_id IS NOT NULL");
		expect(q.sql).toContain("created_at BETWEEN");
		expect(q.params).toHaveLength(2);
	});

	it("aceita o alias da conversa por parâmetro", () => {
		expect(texto(conversaAtribuida(de, ate, sql`conversations`))).toContain(
			"conversations.is_simulated",
		);
	});
});

describe("conversaSemOrigem", () => {
	it("é o complemento exato: mesma janela, visita nula", () => {
		const q = dialect.sqlToQuery(conversaSemOrigem(de, ate));
		expect(q.sql).toContain("is_simulated = false");
		expect(q.sql).toContain("visit_id IS NULL");
		expect(q.sql).toContain("created_at BETWEEN");
		expect(q.params).toHaveLength(2);
	});

	it("as duas metades são disjuntas — nenhuma conversa cai nos dois cortes", () => {
		expect(texto(conversaAtribuida(de, ate))).not.toBe(texto(conversaSemOrigem(de, ate)));
		expect(texto(conversaAtribuida(de, ate))).toContain("IS NOT NULL");
		expect(texto(conversaSemOrigem(de, ate))).toContain("IS NULL");
	});
});

/**
 * O degrau "Se identificaram": nome E contato, nunca só o contato.
 *
 * A prova contra o banco é de integração; aqui o que se prova é que ESTE
 * fragmento carrega as duas condições — se alguém apagar o `name IS NOT NULL`
 * para "simplificar", o teste cai antes de o número inflar em produção.
 */
describe("leadIdentificado", () => {
	const t = texto(leadIdentificado());

	it("exige nome", () => {
		expect(t).toContain("l.name IS NOT NULL");
	});

	it("e exige contato — telefone ou e-mail", () => {
		expect(t).toContain("l.phone IS NOT NULL");
		expect(t).toContain("l.email IS NOT NULL");
	});

	it("aceita o alias do lead por parâmetro", () => {
		expect(texto(leadIdentificado(sql`li`))).toContain("li.name IS NOT NULL");
	});

	it("NÃO é o mesmo que leadComContato, que dispensa o nome", () => {
		const comContato = texto(leadComContato());
		expect(comContato).not.toContain("name");
		expect(comContato).toContain("l.phone IS NOT NULL");
	});
});

describe("conversaIdentificada", () => {
	it("filtra simulado e usa o predicado inteiro", () => {
		const t = texto(conversaIdentificada());
		expect(t).toContain("li.is_simulated = false");
		expect(t).toContain("li.name IS NOT NULL");
		expect(t).toContain("c.id");
	});
});

/**
 * As contagens do funil carregam os DOIS números de contato: o identificado pelo
 * cliente e o contato conhecido. Se `com_contato` sumir, a tela de Campanhas
 * perde a linha que explica por que o número do WhatsApp é maior.
 */
describe("contagensDoFunil", () => {
	const t = texto(contagensDoFunil());

	it("tem a coluna de identificados e a de contato conhecido", () => {
		expect(t).toContain("AS identificados");
		expect(t).toContain("AS com_contato");
	});

	it("identificados usa o predicado com nome; com_contato usa o antigo", () => {
		const identificados = t.slice(
			t.indexOf("count(DISTINCT c.id) FILTER"),
			t.indexOf("AS identificados"),
		);
		expect(identificados).toContain("name IS NOT NULL");
	});
});
