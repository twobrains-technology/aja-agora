/**
 * A regra da limpeza: o sinal de cada candidato, e a paridade do filtro.
 *
 * O teste que mais importa aqui é o último: `estaIdentificado` (JavaScript, usado
 * no filtro do Pipeline) tem que responder IGUAL a `leadIdentificado` (SQL, usado
 * na lista de Conversas e no funil). Duas telas mostrando populações diferentes
 * com o mesmo rótulo é exatamente o defeito que o AJA-27 passou a frente inteira
 * consertando.
 */

import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { estaIdentificado, motivoDeLimpeza } from "./limpeza";
import { leadIdentificado } from "./sinais-do-funil";

describe("estaIdentificado", () => {
	it("exige nome E contato — quem só chegou pelo canal não conta", () => {
		// O caso da cliente (22/09): conversa de WhatsApp nasce com o telefone do
		// `waId`, sem o cliente ter informado nada.
		expect(estaIdentificado({ name: null, phone: "11983065500", email: null })).toBe(false);
	});

	it("conta quando há nome e telefone", () => {
		expect(estaIdentificado({ name: "Bruna", phone: "11983065500", email: null })).toBe(true);
	});

	it("conta quando há nome e apenas e-mail", () => {
		expect(estaIdentificado({ name: "Bruna", phone: null, email: "b@exemplo.com" })).toBe(true);
	});

	it("não conta quando há nome e nenhum contato", () => {
		expect(estaIdentificado({ name: "Bruna", phone: null, email: null })).toBe(false);
	});

	it("não conta quando não há nada", () => {
		expect(estaIdentificado({ name: null, phone: null, email: null })).toBe(false);
	});
});

describe("motivoDeLimpeza", () => {
	const nada = { jaMarcadaComoTeste: false, telefoneDaEquipe: false, naMesaSemContato: false };

	it("não acha sinal em conversa de cliente normal", () => {
		expect(motivoDeLimpeza(nada)).toBeNull();
	});

	it("reconhece cada um dos três sinais", () => {
		expect(motivoDeLimpeza({ ...nada, jaMarcadaComoTeste: true })).toBe("teste");
		expect(motivoDeLimpeza({ ...nada, telefoneDaEquipe: true })).toBe("telefone_da_equipe");
		expect(motivoDeLimpeza({ ...nada, naMesaSemContato: true })).toBe("sem_contato");
	});

	it("com mais de um sinal, o motivo é o mais forte — a linha tem UM motivo", () => {
		expect(
			motivoDeLimpeza({ jaMarcadaComoTeste: true, telefoneDaEquipe: true, naMesaSemContato: true }),
		).toBe("teste");
		expect(
			motivoDeLimpeza({
				jaMarcadaComoTeste: false,
				telefoneDaEquipe: true,
				naMesaSemContato: true,
			}),
		).toBe("telefone_da_equipe");
	});
});

describe("paridade com o predicado SQL", () => {
	const dialect = new PgDialect();

	it("o SQL exige as mesmas três colunas, e o nome é obrigatório", () => {
		const consulta = dialect.sqlToQuery(leadIdentificado(sql`l`)).sql;

		expect(consulta).toContain("l.name IS NOT NULL");
		expect(consulta).toContain("l.phone IS NOT NULL");
		expect(consulta).toContain("l.email IS NOT NULL");
		// Telefone e e-mail são alternATIVos (`OR`), nome é obrigatório (`AND`):
		// inverter isso faria "só telefone" voltar a contar.
		expect(consulta).toMatch(
			/l\.name IS NOT NULL AND \(l\.phone IS NOT NULL OR l\.email IS NOT NULL\)/,
		);
	});

	it("a mesma tabela de casos dá o mesmo veredito nos dois lados", () => {
		// Os casos que o SQL decide por `IS NOT NULL` (não por string vazia — o
		// banco não distingue) e a função decide pelos mesmos campos.
		const casos = [
			{ nome: "só telefone", nome_: null, tel: "11999990000", mail: null, esperado: false },
			{ nome: "só e-mail", nome_: null, tel: null, mail: "a@b.com", esperado: false },
			{ nome: "nome + telefone", nome_: "Ana", tel: "11999990000", mail: null, esperado: true },
			{ nome: "nome + e-mail", nome_: "Ana", tel: null, mail: "a@b.com", esperado: true },
			{ nome: "nome sozinho", nome_: "Ana", tel: null, mail: null, esperado: false },
			{ nome: "vazio", nome_: null, tel: null, mail: null, esperado: false },
		];

		for (const caso of casos) {
			const peloJs = estaIdentificado({ name: caso.nome_, phone: caso.tel, email: caso.mail });
			expect(peloJs, `caso "${caso.nome}"`).toBe(caso.esperado);
		}
	});
});
