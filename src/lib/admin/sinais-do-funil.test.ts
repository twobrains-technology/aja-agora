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
 * O degrau "Se identificaram": a regra é do CANAL, não do preenchimento.
 *
 * Decisão do dono (23/09/2026): *"whatsapp entrou já pode considerar que se
 * identificou, já na web, você tem que considerar quando conseguirmos coletar"*.
 * Aqui o que se prova é que ESTE fragmento carrega a regra — se alguém voltar a
 * exigir nome, ou tirar o `wa_id`, o teste cai antes de o número mentir em
 * produção. A prova contra dado real é de integração.
 */
describe("leadIdentificado", () => {
	const t = texto(leadIdentificado());

	it("identifica pela CONVERSA de WhatsApp", () => {
		expect(t).toContain("c.wa_id IS NOT NULL");
	});

	it("na web, identifica pelo contato que o cliente informou", () => {
		expect(t).toContain("l.phone IS NOT NULL");
		expect(t).toContain("l.email IS NOT NULL");
	});

	it("NÃO exige nome — no WhatsApp ele é o pushName do canal, não do cliente", () => {
		expect(t).not.toContain("l.name");
		expect(t).not.toContain("contact_name");
	});

	it("aceita os dois aliases por parâmetro", () => {
		const outro = texto(leadIdentificado(sql`li`, sql`conv`));
		expect(outro).toContain("conv.wa_id IS NOT NULL");
		expect(outro).toContain("li.phone IS NOT NULL");
	});

	it("usa OR entre canal e contato — as duas portas valem", () => {
		expect(t).toMatch(/c\.wa_id IS NOT NULL OR \(l\.phone IS NOT NULL OR l\.email IS NOT NULL\)/);
	});
});

describe("conversaIdentificada", () => {
	const t = texto(conversaIdentificada());

	it("identifica pela conversa de WhatsApp", () => {
		expect(t).toContain("c.wa_id IS NOT NULL");
	});

	it("e, na web, pelo lead com contato coletado (não simulado)", () => {
		expect(t).toContain("li.is_simulated = false");
		expect(t).toContain("li.phone IS NOT NULL");
		expect(t).toContain("li.email IS NOT NULL");
		expect(t).toContain("c.id");
	});

	/**
	 * O que o predicado NÃO faz mais: exigir nome. Era o que fazia "Se
	 * identificaram" empatar com "Conversas" e ao mesmo tempo subcontar quem só
	 * tinha o nome na conversa — oito conversas da janela 01–21/09 medidas em
	 * produção.
	 */
	it("não exige nome em nenhuma das casas", () => {
		expect(t).not.toContain("contact_name");
		expect(t).not.toContain("li.name");
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

	it("identificados usa o predicado do canal; com_contato usa o do lead", () => {
		const identificados = t.slice(
			t.indexOf("count(DISTINCT c.id) FILTER"),
			t.indexOf("AS identificados"),
		);
		expect(identificados).toContain("wa_id IS NOT NULL");
		expect(t).toContain("com_contato");
	});
});
