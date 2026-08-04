import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { TABELAS_LIMPAS, TABELAS_PRESERVADAS } from "./reset-tables";

function todasAsTabelasDoSchema(): string[] {
	// `unknown` de propósito: o tipo de cada export do schema é literal demais
	// (cada tabela tem o próprio nome no tipo), e o predicado só estreita a
	// partir de um tipo mais largo.
	return Object.values(schema as Record<string, unknown>)
		.filter((valor): valor is PgTable => is(valor, PgTable))
		.map((tabela) => getTableName(tabela));
}

describe("classificação das tabelas do reset", () => {
	it("classifica TODA tabela do schema — nenhuma fica sem decisão", () => {
		// Este é o teste que segura o script no tempo: tabela nova entra no
		// schema e ninguém lembra do reset, o reset silenciosamente deixa dado de
		// produção pra trás (ou apaga configuração que devia sobreviver). Aqui a
		// omissão vira build vermelho em vez de surpresa no marco zero.
		const classificadas = new Set([...TABELAS_LIMPAS, ...TABELAS_PRESERVADAS]);
		const semClassificacao = todasAsTabelasDoSchema().filter((t) => !classificadas.has(t));

		expect(semClassificacao).toEqual([]);
	});

	it("não classifica nenhuma tabela nos dois grupos ao mesmo tempo", () => {
		const preservadas = new Set<string>(TABELAS_PRESERVADAS);
		const emAmbos = TABELAS_LIMPAS.filter((t) => preservadas.has(t));

		expect(emAmbos).toEqual([]);
	});

	it("não lista tabela que não existe mais no schema", () => {
		const existentes = new Set(todasAsTabelasDoSchema());
		const fantasmas = [...TABELAS_LIMPAS, ...TABELAS_PRESERVADAS].filter((t) => !existentes.has(t));

		expect(fantasmas).toEqual([]);
	});

	it("preserva o que faz a operação existir: logins, agente e canal", () => {
		// Template do WhatsApp aprovado leva dias pra reaprovar na Meta; persona e
		// administradora são a configuração do vendedor. Zerar isso não é marco
		// zero, é parada de operação.
		expect(TABELAS_PRESERVADAS).toEqual(
			expect.arrayContaining([
				"user",
				"personas",
				"administradoras",
				"mesa_attendants",
				"whatsapp_templates",
			]),
		);
	});

	it("limpa o rastro de conversa, de lead e a origem de mídia", () => {
		expect(TABELAS_LIMPAS).toEqual(
			expect.arrayContaining([
				"conversations",
				"messages",
				"leads",
				"contacts",
				"bevi_proposals",
				"client_documents",
				"visits",
			]),
		);
	});
});
