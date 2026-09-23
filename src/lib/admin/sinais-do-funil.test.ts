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
import { conversaAtribuida, conversaSemOrigem } from "./sinais-do-funil";

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
