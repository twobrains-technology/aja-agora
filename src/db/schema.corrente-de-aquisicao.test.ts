// A corrente visita → conversa precisa ser indexada.
//
// Não é micro-otimização preventiva: é a aresta percorrida por TODA leitura de
// aquisição do painel. `VISITA_DE_GENTE` (`sinais-do-funil.ts`) faz um EXISTS
// sobre `conversations` por visita, `performance-queries` a usa em quatro
// consultas e o Percurso ainda dá JOIN por cima dela.
//
// Medido em 18/08/2026 contra o volume real de produção (40.134 visitas e
// 5.134 conversas, a ordem de grandeza dos 30 dias medidos em 15/08):
//
//   sem índice → 157 ms (mediana de 3; a primeira execução, fria, deu 323 ms)
//   com índice →  52 ms (mediana de 3)
//
// Três vezes, e a distância CRESCE com o histórico, porque sem o índice cada
// visita custa um seq scan de `conversations` — o custo é linear no total de
// conversas, que só aumenta.
//
// Este teste é estrutural (lê o schema, não toca o banco) e existe porque um
// índice que some não quebra nada: a tela continua correta, só fica cada vez
// mais lenta, e ninguém liga a lentidão ao commit que a causou.

import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { conversations, pageEvents, visits } from "./schema";

describe("a corrente de aquisição está indexada", () => {
	it("indexa conversations.visit_id — a aresta que todo relatório percorre", () => {
		const cfg = getTableConfig(conversations);
		const porVisita = cfg.indexes.find((i) =>
			i.config.columns.some((c) => "name" in c && c.name === "visit_id"),
		);

		expect(porVisita).toBeDefined();
		expect(porVisita?.config.name).toBe("conversations_visit_id_idx");
	});

	it("mantém indexadas as outras duas pontas da corrente", () => {
		// `page_events.visit_id` decide o degrau "Olhou a página" e é a base do
		// mapa de calor; `visits.created_at` é o recorte de período de toda tela.
		const eventos = getTableConfig(pageEvents);
		expect(
			eventos.indexes.some((i) =>
				i.config.columns.some((c) => "name" in c && c.name === "visit_id"),
			),
		).toBe(true);

		const chegadas = getTableConfig(visits);
		expect(
			chegadas.indexes.some((i) =>
				i.config.columns.some((c) => "name" in c && c.name === "created_at"),
			),
		).toBe(true);
	});
});
