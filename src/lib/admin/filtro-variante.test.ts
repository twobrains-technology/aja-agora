// O recorte por BRAÇO de experimento, sem banco.
//
// O que este arquivo prova é a FORMA do recorte e a allowlist por experimento:
// valor desconhecido não filtra (nunca 400, nunca tela vazia), a precedência é
// URL > cookie > nenhum, e `[]` devolve `null` — nenhum SQL novo entra na
// consulta, que é o que faz o default não mover número nenhum.
//
// `toSQL()` monta a consulta sem executar: nenhuma conexão é aberta.

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { EXPERIMENTOS, lerRecorteAB } from "@/lib/experimentos/registro";
import {
	bracoDaConversaSql,
	condicaoDeBracoDaPessoa,
	condicaoDeBracoNaConversa,
	recorteDaRequisicao,
} from "./filtro-variante";
import { fatoDaEtapaNaConversa } from "./sinais-do-funil";

const TELEFONE = EXPERIMENTOS[0];
if (!TELEFONE) throw new Error("o registro precisa do experimento do telefone");
/** O id do experimento — lido do REGISTRO, nunca redigitado (D4). */
const CHAVE = TELEFONE.id;

function requisicao(url: string, cookie?: string): Request {
	return new Request(url, cookie ? { headers: { cookie } } : undefined);
}

describe("recorteDaRequisicao — URL > cookie > nenhum", () => {
	it("lê o par da querystring", () => {
		expect(recorteDaRequisicao(requisicao(`http://test/api?ab=${CHAVE}:A`))).toEqual([
			{ experimento: CHAVE, braco: "A" },
		]);
	});

	it("sem querystring, lê o cookie de sessão", () => {
		expect(
			recorteDaRequisicao(requisicao(`http://test/api`, `outro=1; aja_ab=${CHAVE}:B`)),
		).toEqual([{ experimento: CHAVE, braco: "B" }]);
	});

	it("a URL vence o cookie", () => {
		expect(
			recorteDaRequisicao(requisicao(`http://test/api?ab=${CHAVE}:A`, `aja_ab=${CHAVE}:B`)),
		).toEqual([{ experimento: CHAVE, braco: "A" }]);
	});

	it("sem URL e sem cookie, nenhum recorte", () => {
		expect(recorteDaRequisicao(requisicao("http://test/api"))).toEqual([]);
	});

	it("par inválido na URL não desce para o cookie", () => {
		expect(
			recorteDaRequisicao(requisicao(`http://test/api?ab=${CHAVE}:C`, `aja_ab=${CHAVE}:B`)),
		).toEqual([]);
	});

	it("cookie com `%` solto não lança", () => {
		expect(() => recorteDaRequisicao(requisicao("http://test/api", "aja_ab=%"))).not.toThrow();
		expect(recorteDaRequisicao(requisicao("http://test/api", "aja_ab=%"))).toEqual([]);
	});
});

describe("condicaoDeBracoNaConversa — nível conversa (D10)", () => {
	it("recorte vazio ⇒ null (nenhum SQL novo entra)", () => {
		expect(condicaoDeBracoNaConversa([])).toBeNull();
	});

	it("braço A produz predicado sobre o metadata, com o id como parâmetro", () => {
		const condicao = condicaoDeBracoNaConversa(lerRecorteAB(`${CHAVE}:A`));
		if (!condicao) throw new Error("o recorte A devia produzir condição");

		const consulta = db.select().from(conversations).where(condicao).toSQL();
		expect(consulta.sql).toContain("metadata");
		// A chave do experimento entra como PARÂMETRO, nunca colada no texto.
		expect(consulta.params).toContain(CHAVE);
		expect(consulta.params).toContain("A");
	});

	it("`sem variante` fecha a partição com valor fora da allowlist", () => {
		const condicao = condicaoDeBracoNaConversa(lerRecorteAB(`${CHAVE}:sem-variante`));
		if (!condicao) throw new Error("o recorte sem-variante devia produzir condição");

		const consulta = db.select().from(conversations).where(condicao).toSQL();
		// A allowlist do braço entra no SQL: 'C' no metadata cai em `IS NULL`.
		expect(consulta.sql).toContain("IS NULL");
		expect(consulta.params).toContain("A");
		expect(consulta.params).toContain("B");
	});
});

describe("bracoDaConversaSql — a expressão do braço", () => {
	it("lê a chave do experimento no metadata e aplica a allowlist", () => {
		const expressao = bracoDaConversaSql(TELEFONE, sql`c`);
		const consulta = db.select({ braco: expressao }).from(conversations).toSQL();

		expect(consulta.sql).toContain("metadata");
		expect(consulta.params).toContain(CHAVE);
		expect(consulta.params).toContain("A");
		expect(consulta.params).toContain("B");
	});
});

describe("fatoDaEtapaNaConversa — a forma por conversa do fato do funil", () => {
	it("visitas e conversas não têm fato de avanço", () => {
		expect(fatoDaEtapaNaConversa("visitas", sql`c`)).toBeNull();
		expect(fatoDaEtapaNaConversa("conversas", sql`c`)).toBeNull();
	});

	it("identificados é o predicado do funil, por conversa", () => {
		const fato = fatoDaEtapaNaConversa("identificados", sql`c`);
		if (!fato) throw new Error("identificados devia ter fato");

		const consulta = db.select({ avancou: fato }).from(conversations).toSQL();
		expect(consulta.sql).toContain("wa_id IS NOT NULL");
		expect(consulta.sql).toContain("FROM leads");
	});
});

describe("condicaoDeBracoDaPessoa — nível pessoa", () => {
	it("recorte vazio ⇒ null", () => {
		expect(
			condicaoDeBracoDaPessoa([], { de: new Date(0), ate: new Date(1), chave: sql`v.visitor_id` }),
		).toBeNull();
	});

	it("com recorte produz subconsulta correlacionada pela chave", () => {
		const condicao = condicaoDeBracoDaPessoa(lerRecorteAB(`${CHAVE}:A`), {
			de: new Date(0),
			ate: new Date(1),
			chave: sql`v.visitor_id`,
			colunaVisitor: sql`v.visitor_id`,
		});
		if (!condicao) throw new Error("o recorte A devia produzir condição");

		const consulta = db.select().from(conversations).where(condicao).toSQL();
		expect(consulta.sql).toContain("ORDER BY");
		expect(consulta.sql).toContain("LIMIT 1");
		expect(consulta.params).toContain(CHAVE);
		expect(consulta.params).toContain("A");
	});
});
