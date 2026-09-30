// O RECORTE por braço de experimento no mapa de calor (FIX-404, bloco B2d).
//
// O mapa conta PESSOAS por página (`visitantes`, `pessoasNaPagina`,
// `pessoasPorPagina`), então o recorte tem que ser o da PESSOA — o mesmo
// fragmento que Performance, Porta e Campanhas usam (`condicaoDeBracoDaPessoa`),
// e não o predicado por conversa. É essa escolha que faz o número desta tela
// fechar com o das outras.
//
// O invariante que este arquivo protege é o fechamento: `A + B + sem variante =
// total`, por página. Sem ele, o operador filtra "A" e vê um número que não sabe
// de onde veio nem quanto do todo ele representa.
//
// Mesma disciplina do teste irmão (`queries.integration.test.ts`): janela de
// data sorteada por execução, porque o Postgres do workspace é compartilhado
// entre agentes e duas execuções simultâneas na mesma janela derrubariam a
// contagem exata, que é justamente o valor do teste. O `path` é o mesmo do teste
// irmão; o que isola os dois é a janela.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPERIMENTOS, type RecorteAB, SEM_BRACO } from "@/lib/experimentos/registro";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const JANELA_DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const JANELA_ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

const PATH = "/autos";

// O experimento vem do REGISTRO — nada aqui conhece o nome da chave do telefone
// (é o mesmo contrato que o resto da frente consome).
const EXPERIMENTO = EXPERIMENTOS[0];
const ID_DO_EXPERIMENTO = EXPERIMENTO.id;
const BRACO_A = EXPERIMENTO.bracos[0];
const BRACO_B = EXPERIMENTO.bracos[1];

/** Um recorte de um par, no formato que as rotas montam. */
function recorte(braco: string): RecorteAB {
	return [{ experimento: ID_DO_EXPERIMENTO, braco }];
}

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

describeIfDb("mapa de calor — recorte por braço (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	function evento(visitId: string): typeof import("@/db/schema").pageEvents.$inferInsert {
		return {
			visitId,
			path: PATH,
			viewportWidth: 390,
			viewportHeight: 844,
			device: "mobile",
			createdAt: DENTRO,
			type: "click",
			selector: "button#simular",
			label: "Simular",
		} as typeof import("@/db/schema").pageEvents.$inferInsert;
	}

	/**
	 * Uma pessoa na página. `braco` = `null` cria quem chegou e nunca entrou numa
	 * conversa com braço (o balde `sem variante`); qualquer outro valor vira a
	 * variante gravada no metadata.
	 */
	async function semearPessoa(braco: string | null): Promise<void> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `v-${crypto.randomUUID()}`,
				channel: "web",
				landingPath: PATH,
				createdAt: DENTRO,
				userAgent: UA_GENTE,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);

		await db.insert(schema.pageEvents).values(evento(visita.id));

		if (braco === null) return;

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId: visita.id,
				isSimulated: false,
				createdAt: DENTRO,
				updatedAt: DENTRO,
				// PII falsa: aqui só a variante do teste importa.
				metadata: { [ID_DO_EXPERIMENTO]: { variante: braco } },
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);
	}

	async function mapa(recorteDoTeste?: RecorteAB) {
		return queries.computeMapaDeCalor({
			path: PATH,
			from: JANELA_DE,
			to: JANELA_ATE,
			recorte: recorteDoTeste,
		});
	}

	/** Pessoas que CHEGARAM na página (a linha que reconcilia com as vizinhas). */
	function pessoasDaPagina(m: { pessoasPorPagina: { path: string; pessoas: number }[] }): number {
		return m.pessoasPorPagina.find((p) => p.path === PATH)?.pessoas ?? 0;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./queries");

		// 1 com braço A, 1 com braço B, 1 que nunca teve conversa com braço, e 1 com
		// valor FORA da allowlist no metadata (o `"C"` aposentado pelo FIX-403) —
		// esse último tem que cair em `sem variante`, não sumir de todos os baldes.
		await semearPessoa(BRACO_A);
		await semearPessoa(BRACO_B);
		await semearPessoa(null);
		await semearPessoa("C");
	});

	afterAll(async () => {
		if (visitIds.length > 0) {
			// `page_events.visit_id` é `set null`, não `cascade` — o evento sobrevive
			// à visita e sujaria a janela da próxima execução.
			await db.delete(schema.pageEvents).where(inArray(schema.pageEvents.visitId, visitIds));
		}
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	it("fecha por pessoa: A + B + sem variante = todas", async () => {
		const todas = await mapa();
		const a = await mapa(recorte(BRACO_A));
		const b = await mapa(recorte(BRACO_B));
		const sem = await mapa(recorte(SEM_BRACO));

		expect(todas.visitantes).toBe(4);
		expect([a.visitantes, b.visitantes, sem.visitantes]).toEqual([1, 1, 2]);
		expect(a.visitantes + b.visitantes + sem.visitantes).toBe(todas.visitantes);
	});

	it("fecha nas três contagens de pessoa da tela, não só no cabeçalho", async () => {
		const todas = await mapa();
		const baldes = await Promise.all([
			mapa(recorte(BRACO_A)),
			mapa(recorte(BRACO_B)),
			mapa(recorte(SEM_BRACO)),
		]);

		for (const contar of [pessoasDaPagina, (m: { pessoasNaPagina: number }) => m.pessoasNaPagina]) {
			const total = contar(todas);
			const soma = baldes.reduce((acc, m) => acc + contar(m), 0);
			expect(total).toBe(4);
			expect(soma).toBe(total);
		}
	});

	it("sem recorte, a resposta é idêntica à de hoje (o default não move número)", async () => {
		const semParametro = await queries.computeMapaDeCalor({
			path: PATH,
			from: JANELA_DE,
			to: JANELA_ATE,
		});
		expect(await mapa([])).toEqual(semParametro);
	});

	it("par fora do registro, ou braço fora da lista do experimento, não recorta", async () => {
		const todas = await mapa([{ experimento: "experimento-que-nao-existe", braco: BRACO_A }]);
		expect(todas.visitantes).toBe(4);

		const bracoInexistente = await mapa([{ experimento: ID_DO_EXPERIMENTO, braco: "C" }]);
		expect(bracoInexistente.visitantes).toBe(4);
	});
});
