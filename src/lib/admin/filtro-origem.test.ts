// O predicado de origem com MAIS DE UMA campanha, sem banco.
//
// O `filtro-origem.integration.test.ts` prova, contra Postgres, que o número da
// tabela é o que o clique abre. Aqui a pergunta é outra e é de forma: a lista
// chega ao SQL como `IN` parametrizado (nunca como `OR` colado à mão), a lista
// vazia NÃO produz recorte, e a chave desconhecida continua devolvendo `null` —
// o link velho mostra tudo em vez de abrir uma lista vazia.
//
// `toSQL()` monta a consulta sem executar: nenhuma conexão é aberta.

import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { Campanhas } from "./campanhas";
import { condicaoDeOrigem, ORIGEM_SEM_ORIGEM, predicadoDeOrigemNaVisita } from "./filtro-origem";

/** A consulta que o predicado produz — texto e parâmetros, sem tocar o banco. */
function sqlDoPredicado(chave: string, campanhas: Campanhas) {
	const predicado = predicadoDeOrigemNaVisita(chave, campanhas);
	if (!predicado) throw new Error(`"${chave}" devia produzir predicado`);
	return db.select().from(conversations).where(predicado).toSQL();
}

describe("predicadoDeOrigemNaVisita — recorte por campanha", () => {
	it("duas campanhas viram uma condição que casa as duas", () => {
		const { sql, params } = sqlDoPredicado("campanha:ig", ["camp-1", "camp-2"]);

		// `in ($n, $n)` e não um `OR` montado à mão: a lista é dado, não texto.
		expect(sql).toContain("v.utm_campaign in");
		// A campanha tem duas identidades na visita: a UTM digitada e o id da Meta.
		expect(sql).toContain("v.campaign_id in");
		expect(params).toContain("camp-1");
		expect(params).toContain("camp-2");
		// `lower()` continua no `utm_source`, que é o que junta "IG" e "ig".
		expect(sql).toContain("lower(v.utm_source) = lower(");
	});

	it("aceita a lista como a querystring a entrega ('a,b,c')", () => {
		const separado = sqlDoPredicado("campanha:ig", "camp-1,camp-2");
		const emArray = sqlDoPredicado("campanha:ig", ["camp-1", "camp-2"]);

		expect(separado.sql).toBe(emArray.sql);
		expect(separado.params).toEqual(emArray.params);
	});

	it("uma campanha só continua com o comportamento de antes", () => {
		const { params } = sqlDoPredicado("campanha:ig", "camp-1");
		expect(params.filter((p) => p === "camp-1")).toHaveLength(2);
		expect(params).not.toContain("camp-2");
	});

	it("lista vazia NÃO filtra por campanha — e não vira `IN ()`", () => {
		const comVazio = sqlDoPredicado("campanha:ig", []);
		const semFiltro = sqlDoPredicado("campanha:ig", null);

		// Mesmo SQL: "sem campanha escolhida" é "não recortar por campanha".
		expect(comVazio.sql).toBe(semFiltro.sql);
		expect(comVazio.params).toEqual(["ig"]);
		expect(comVazio.sql).not.toContain("v.utm_campaign in");
		expect(comVazio.sql).not.toContain("v.campaign_id in");
		// O erro clássico: um `in ()` que não casa nada.
		expect(comVazio.sql).not.toContain("in ()");
	});

	it("a lista vazia também some quando chega pela querystring", () => {
		const { params, sql } = sqlDoPredicado("campanha:ig", " , ");
		expect(params).toEqual(["ig"]);
		expect(sql).not.toContain("v.utm_campaign in");
	});

	it("campanha só recorta origem de campanha — os outros canais seguem intactos", () => {
		const direto = sqlDoPredicado("direto", ["camp-1"]);
		expect(direto.sql).not.toContain("v.utm_campaign in");
	});
});

describe("condicaoDeOrigem — o `null` que significa 'não filtrar'", () => {
	it("chave desconhecida continua devolvendo null, agora com lista", () => {
		expect(condicaoDeOrigem("qualquer-coisa", ["camp-1"])).toBeNull();
		expect(condicaoDeOrigem("campanha:", ["camp-1"])).toBeNull();
		expect(condicaoDeOrigem(null, ["camp-1"])).toBeNull();
	});

	it("lista vazia com origem válida ainda filtra pela origem", () => {
		const comVazio = condicaoDeOrigem("campanha:ig", []);
		if (!comVazio) throw new Error("condição devia existir");
		const { sql, params } = db.select().from(conversations).where(comVazio).toSQL();
		expect(sql).toContain("EXISTS");
		expect(params).toEqual(["ig"]);
	});

	it("'desconhecida' não vira EXISTS em visits — é a coluna nula (AJA-17)", () => {
		// O erro fácil aqui é deixar a chave cair no `default` (que devolve null) e o
		// link abrir a lista inteira fingindo ser um recorte.
		const condicao = condicaoDeOrigem(ORIGEM_SEM_ORIGEM);
		if (!condicao) throw new Error("condição devia existir");
		const { sql } = db.select().from(conversations).where(condicao).toSQL();

		// O Drizzle imprime `"conversations"."visit_id" IS NULL` em maiúscula.
		expect(sql.toLowerCase()).toContain("visit_id");
		expect(sql.toLowerCase()).toContain("is null");
		expect(sql).not.toContain("EXISTS");
	});
});
