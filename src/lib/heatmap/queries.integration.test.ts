// Os NÚMEROS do mapa de calor, contra Postgres real (integration-db).
//
// `aggregate.ts` já era testado — e é a metade pura. A metade que produz os
// quatro números do cabeçalho da tela (visitantes, cliques, de raiva, rolagem
// média) vive em SQL, e não tinha um único teste. Foi por aí que passou o
// defeito que originou este arquivo: a rolagem média é a média dos MARCOS
// gravados, e como cada visitante grava um marco por faixa cruzada (25, 50, 75,
// 100), quem lê a página inteira contribui com 25+50+75+100 — média 62,5. O
// número é matematicamente incapaz de chegar a 100%, e em produção (24/08/2026)
// `/autos` mostrava 58,3% de rolagem média com TODOS os visitantes tendo rolado
// a página até o fim.
//
// Mesma disciplina do teste do percurso: janela de data sorteada por execução,
// porque o Postgres do workspace é compartilhado entre agentes e duas execuções
// simultâneas na mesma janela derrubam a contagem exata — que é o valor do
// teste.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const JANELA_DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const JANELA_ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

// Uma landing por cenário: os três cenários vivem na mesma janela de tempo, e
// `computeMapaDeCalor` recorta por `path` — é o isolamento mais barato que
// existe aqui, e sem ele um cenário conta os cliques do outro.
const PATH_ROLAGEM = "/motos";
const PATH_POPULACAO = "/autos";
const PATH_ALVOS = "/imoveis";

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

describeIfDb("mapa de calor — os números do cabeçalho (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./queries");

	const visitIds: string[] = [];

	async function semearVisita(path: string): Promise<string> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `v-${crypto.randomUUID()}`,
				channel: "web",
				landingPath: path,
				createdAt: DENTRO,
				userAgent: UA_GENTE,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);
		return visita.id;
	}

	/** Um evento cru, com o mínimo que a tabela exige. */
	function evento(
		visitId: string | null,
		path: string,
		extra: Partial<typeof schema.pageEvents.$inferInsert>,
	): typeof schema.pageEvents.$inferInsert {
		return {
			visitId,
			path,
			viewportWidth: 390,
			viewportHeight: 844,
			device: "mobile",
			createdAt: DENTRO,
			type: "click",
			...extra,
		} as typeof schema.pageEvents.$inferInsert;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./queries");
	});

	afterAll(async () => {
		if (visitIds.length > 0) {
			// `page_events.visit_id` é `set null`, não `cascade` — o evento sobrevive
			// à visita e sujaria a janela da próxima execução.
			await db.delete(schema.pageEvents).where(inArray(schema.pageEvents.visitId, visitIds));
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	describe("rolagem média", () => {
		it("é a média do ponto MAIS FUNDO de cada visitante, não a média dos marcos gravados", async () => {
			// Quem lê a página inteira grava 25, 50, 75 e 100 — quatro linhas, uma
			// por faixa cruzada. Quem para na metade grava 25 e 50.
			const inteiro = await semearVisita(PATH_ROLAGEM);
			const metade = await semearVisita(PATH_ROLAGEM);

			await db
				.insert(schema.pageEvents)
				.values([
					...[25, 50, 75, 100].map((pct) =>
						evento(inteiro, PATH_ROLAGEM, { type: "scroll_depth", scrollPct: pct }),
					),
					...[25, 50].map((pct) =>
						evento(metade, PATH_ROLAGEM, { type: "scroll_depth", scrollPct: pct }),
					),
				]);

			const mapa = await queries.computeMapaDeCalor({
				path: PATH_ROLAGEM,
				from: JANELA_DE,
				to: JANELA_ATE,
			});

			// Um leu tudo (100%), o outro leu metade (50%): a rolagem média é 75%.
			// A média das seis linhas gravadas dá 54% — e nenhuma página, por melhor
			// que seja, conseguiria passar de 62,5% nessa conta.
			expect(mapa.scrollMedio).toBe(75);
		});
	});

	describe("uma população só", () => {
		it("não conta no cabeçalho o evento sem visita, que nenhum outro recorte da tela alcança", async () => {
			const comVisita = await semearVisita(PATH_POPULACAO);

			await db.insert(schema.pageEvents).values([
				evento(comVisita, PATH_POPULACAO, { selector: "button[0]", label: "Simular" }),
				// Sem cookie de visita. O filtro de desfecho já o descarta por
				// construção (não há como saber no que ele deu), então mantê-lo só no
				// recorte "todos" fazia a linha de baixo comparar duas populações
				// diferentes — que é justamente o que a tela pede pro operador fazer.
				evento(null, PATH_POPULACAO, { selector: "button[1]", label: "Anônimo" }),
			]);

			const mapa = await queries.computeMapaDeCalor({
				path: PATH_POPULACAO,
				from: JANELA_DE,
				to: JANELA_ATE,
			});

			expect(mapa.visitantes).toBe(1);
			expect(mapa.cliques).toBe(1);
			expect(mapa.alvos.map((a) => a.label)).toEqual(["Simular"]);
		});
	});

	describe("fatia de cada alvo", () => {
		it("divide pelos cliques do PERÍODO, não pelos alvos que couberam na lista", async () => {
			const visita = await semearVisita(PATH_ALVOS);

			// 45 seletores distintos: a consulta devolve os 40 primeiros, e a cauda
			// que fica de fora continua sendo clique do período.
			const campeao = Array.from({ length: 10 }, () =>
				evento(visita, PATH_ALVOS, { selector: "a#campeao", label: "Campeão" }),
			);
			const cauda = Array.from({ length: 45 }, (_, i) =>
				evento(visita, PATH_ALVOS, { selector: `a#cauda-${i}`, label: `Cauda ${i}` }),
			);

			await db.insert(schema.pageEvents).values([...campeao, ...cauda]);

			const mapa = await queries.computeMapaDeCalor({
				path: PATH_ALVOS,
				from: JANELA_DE,
				to: JANELA_ATE,
			});

			expect(mapa.cliques).toBe(55);

			const lider = mapa.alvos[0];
			expect(lider.label).toBe("Campeão");
			expect(lider.cliques).toBe(10);
			// 10 de 55 cliques = 18,2%. Sobre os 40 alvos devolvidos (49 cliques) a
			// tela mostrava 20,4% — um número que não fecha com o total de cliques
			// impresso na linha de cima.
			expect(lider.sharePct).toBe(18.2);
		});
	});
});
