// Integração (Postgres do workspace) — o braço do experimento atribuído à PESSOA.
//
// O que este arquivo protege é a REGRA, e ela não é testável sem banco: o que
// pode divergir é exatamente o SQL — a ordem (`avancou` primeiro, a PRIMEIRA;
// senão a ÚLTIMA exposição), o desempate por `id`, e o fechamento
// `A + B + sem variante = total`. Um teste com mock mediria o mock.
//
// As duas formas que o painel usa nascem juntas e são testadas juntas, porque
// aqui elas respondem a MESMA pergunta por caminhos diferentes:
//
//   • ESCALAR (`bracoDaPessoaSql`) — os funis de Performance/Porta/Origens/
//     Campanhas/Mapa, que já usam escalar irmão do `chaveDaPessoa`;
//   • CTE (`cteDoBracoDaPessoa`)   — Percurso e exportação `percurso`.
//
// Se as duas divergirem, o número da tela de Performance e o da Exportação
// passam a discordar com o mesmo rótulo — o defeito de família que este painel
// já combateu (FIX-398).
//
// PII **falsa**: os telefones/e-mails semeados são de exemplo e não existem.

import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXPERIMENTOS, lerRecorteAB, PARAMETRO_DO_RECORTE_AB } from "@/lib/experimentos/registro";
import {
	bracoDaPessoaSql,
	condicaoDeBracoDaPessoa,
	condicaoDeBracoNaConversa,
	cteDoBracoDaPessoa,
	recorteDaRequisicao,
} from "./filtro-variante";
import { chaveDaPessoa, contagensDoFunil } from "./sinais-do-funil";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const DE = new Date("2019-05-01T00:00:00Z");
const ATE = new Date("2019-05-31T23:59:59.999Z");
const DENTRO = new Date("2019-05-10T12:00:00Z");
const DEPOIS = new Date("2019-05-20T12:00:00Z");
const FORA = new Date("2019-04-10T12:00:00Z");

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

const TELEFONE = EXPERIMENTOS[0];
if (!TELEFONE) throw new Error("o registro precisa do experimento do telefone");
const CHAVE = TELEFONE.id;

/** O recorte de UM experimento, como a rota o lê da querystring. */
function recorteDe(braco: string) {
	return lerRecorteAB(`${CHAVE}:${braco}`);
}

describeIfDb("braço da pessoa — ancorado na identificação", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const contactIds: string[] = [];

	/** O visitante com que cada pessoa semeada se identifica no teste. */
	const pessoas: string[] = [];

	function visitante(nome: string): string {
		return `fix404-${nome}-${crypto.randomUUID()}`;
	}

	interface ConversaSemeada {
		em: Date;
		/** Ausente = conversa sem metadata (pré-teste). `"C"` = valor fora da allowlist. */
		variante?: string;
		/** Cria o lead com telefone — é o que torna a conversa "identificada". */
		identificada?: boolean;
		waId?: string;
		/** `false` = conversa sem visita (caso real do WhatsApp orgânico). */
		comVisita?: boolean;
		id?: string;
		contatoId?: string;
	}

	async function semear(semente: {
		visitante: string;
		conversas: ConversaSemeada[];
	}): Promise<string[]> {
		pessoas.push(semente.visitante);
		const criadas: string[] = [];

		for (const c of semente.conversas) {
			let visitId: string | null = null;
			if (c.comVisita !== false) {
				const [visita] = await db
					.insert(schema.visits)
					.values({
						visitorId: semente.visitante,
						channel: "web",
						createdAt: c.em,
						userAgent: UA_GENTE,
					})
					.returning({ id: schema.visits.id });
				if (!visita) throw new Error("falha ao semear a visita");
				visitId = visita.id;
				visitIds.push(visita.id);
			}

			const [conversa] = await db
				.insert(schema.conversations)
				.values({
					...(c.id ? { id: c.id } : {}),
					visitId,
					channel: c.waId ? "whatsapp" : "web",
					waId: c.waId ?? null,
					contactId: c.contatoId ?? null,
					isSimulated: false,
					createdAt: c.em,
					updatedAt: c.em,
					metadata: c.variante === undefined ? null : { [CHAVE]: { variante: c.variante } },
				})
				.returning({ id: schema.conversations.id });
			if (!conversa) throw new Error("falha ao semear a conversa");
			convIds.push(conversa.id);
			criadas.push(conversa.id);

			if (c.identificada) {
				await db.insert(schema.leads).values({
					conversationId: conversa.id,
					phone: "5500900000000",
					isSimulated: false,
				});
			}
		}

		return criadas;
	}

	/** O braço na forma ESCALAR, para uma pessoa (pode não ter visita).
	 *
	 *  A chave da pessoa é a MESMA do painel (`chaveDaPessoa`): é ela que funde
	 *  web e WhatsApp (e dois aparelhos) numa pessoa só.
	 */
	async function bracoEscalar(visitanteDaPessoa: string): Promise<string | null> {
		const escalar = bracoDaPessoaSql(TELEFONE, {
			de: DE,
			ate: ATE,
			chave: chaveDaPessoa(DE, ATE, sql`${visitanteDaPessoa}`),
			colunaVisitor: sql`${visitanteDaPessoa}`,
		});
		const resultado = await db.execute<{ braco: string | null }>(sql`SELECT ${escalar} AS braco`);
		return resultado.rows[0]?.braco ?? null;
	}

	/** O braço na forma CTE, para uma pessoa (pode não ter visita).
	 *
	 *  `fonte` = `visits` e a `chave` é a já computada — no Percurso de verdade é
	 *  a chave do `por_visita`, que também passa pelo `chaveDaPessoa`.
	 */
	async function bracoCte(visitanteDaPessoa: string): Promise<string | null> {
		const chaveDaPessoaDaFonte = chaveDaPessoa(DE, ATE, sql`pv.visitor_id`);
		const cte = cteDoBracoDaPessoa(TELEFONE, {
			de: DE,
			ate: ATE,
			chave: chaveDaPessoaDaFonte,
			fonte: sql`visits`,
		});
		const identidade = chaveDaPessoa(DE, ATE, sql`${visitanteDaPessoa}`);
		const resultado = await db.execute<{ braco: string | null }>(sql`
			WITH ${cte}
			SELECT bp.braco AS braco
			FROM (SELECT ${identidade} AS identidade) x
			LEFT JOIN braco_da_pessoa bp ON bp.chave = x.identidade
		`);
		return resultado.rows[0]?.braco ?? null;
	}

	/** As duas formas concordam? Devolve o veredito das duas. */
	async function braco(
		visitanteDaPessoa: string,
	): Promise<{ escalar: string | null; cte: string | null }> {
		return {
			escalar: await bracoEscalar(visitanteDaPessoa),
			cte: await bracoCte(visitanteDaPessoa),
		};
	}

	// ── Os casos semeados (refino 3 §3/§8) ────────────────────────────────────
	const casos: Array<{ nome: string; visitante: string; esperado: string | null }> = [];
	let pessoaDoEmpate: string;
	let varianteDoMenorId: string;
	let pessoaComContato: string;
	let outroVisitanteDoContato: string;

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");

		// 1 · identificou em A e abriu B depois ⇒ A (a âncora vence a exposição).
		const v1 = visitante("ancora");
		await semear({
			visitante: v1,
			conversas: [
				{ em: DENTRO, variante: "A", identificada: true },
				{ em: DEPOIS, variante: "B" },
			],
		});
		casos.push({ nome: "identificou em A e abriu B depois", visitante: v1, esperado: "A" });

		// 2 · identificou em A (t1) e reidentificou em B (t3) ⇒ A (a primeira transição).
		const v2 = visitante("reidentificou");
		await semear({
			visitante: v2,
			conversas: [
				{ em: DENTRO, variante: "A", identificada: true },
				{ em: DEPOIS, variante: "B", identificada: true },
			],
		});
		casos.push({ nome: "identificou em A e reidentificou em B", visitante: v2, esperado: "A" });

		// 3 · nunca identificou, A em t1 e B em t2 ⇒ B (exposição: a última).
		const v3 = visitante("exposicao");
		await semear({
			visitante: v3,
			conversas: [
				{ em: DENTRO, variante: "A" },
				{ em: DEPOIS, variante: "B" },
			],
		});
		casos.push({ nome: "nunca identificou: A t1 e B t2", visitante: v3, esperado: "B" });

		// 4 · identificou no web B e continuou no WhatsApp ⇒ B (o WhatsApp não é candidata).
		const v4 = visitante("web-e-whatsapp");
		await semear({
			visitante: v4,
			conversas: [
				{ em: DENTRO, variante: "B", identificada: true },
				{ em: DEPOIS, waId: "5500900000001", comVisita: false },
			],
		});
		casos.push({
			nome: "identificou no web B e continuou no WhatsApp",
			visitante: v4,
			esperado: "B",
		});

		// 5 · última conversa do período é WhatsApp, web anterior em B ⇒ B (não reseta).
		const v5 = visitante("whatsapp-depois");
		await semear({
			visitante: v5,
			conversas: [
				{ em: DENTRO, variante: "B" },
				{ em: DEPOIS, waId: "5500900000002", comVisita: false },
			],
		});
		casos.push({ nome: "última conversa é WhatsApp", visitante: v5, esperado: "B" });

		// 6 · só WhatsApp ⇒ sem variante (nasce identificado, fora do teste).
		const v6 = visitante("so-whatsapp");
		await semear({
			visitante: v6,
			conversas: [{ em: DENTRO, waId: "5500900000003", comVisita: false }],
		});
		casos.push({ nome: "só WhatsApp", visitante: v6, esperado: null });

		// 7 · braço só fora do período ⇒ sem variante (o período manda).
		const v7 = visitante("fora-do-periodo");
		await semear({ visitante: v7, conversas: [{ em: FORA, variante: "A" }] });
		casos.push({ nome: "braço só fora do período", visitante: v7, esperado: null });

		// 8 · conversa identificada sem braço ⇒ sem variante.
		const v8 = visitante("identificada-sem-braco");
		await semear({ visitante: v8, conversas: [{ em: DENTRO, identificada: true }] });
		casos.push({ nome: "sem conversa com braço", visitante: v8, esperado: null });

		// 9 · identificou em conversa pré-teste SEM braço, com braço depois ⇒ última exposição.
		const v9 = visitante("pre-teste");
		await semear({
			visitante: v9,
			conversas: [
				{ em: DENTRO, identificada: true },
				{ em: DEPOIS, variante: "B" },
			],
		});
		casos.push({
			nome: "identificou em conversa pré-teste sem braço",
			visitante: v9,
			esperado: "B",
		});

		// 10 · empate de `created_at` ⇒ o `id` desempata (ASC), determinístico.
		pessoaDoEmpate = visitante("empate");
		const idMenor = "00000000-0000-4000-8000-000000000001";
		const idMaior = "00000000-0000-4000-8000-000000000002";
		await semear({
			visitante: pessoaDoEmpate,
			conversas: [
				{ em: DENTRO, variante: "A", id: idMenor },
				{ em: DENTRO, variante: "B", id: idMaior },
			],
		});
		varianteDoMenorId = "A";

		// 11 · override de QA REGRAVADO ⇒ vale o valor atual gravado.
		const v11 = visitante("override");
		const [convOverride] = await semear({
			visitante: v11,
			conversas: [{ em: DENTRO, variante: "A", identificada: true }],
		});
		if (!convOverride) throw new Error("falha ao semear o override");
		await db
			.update(schema.conversations)
			.set({ metadata: { [CHAVE]: { variante: "B" } } })
			.where(inArray(schema.conversations.id, [convOverride]));
		casos.push({ nome: "override de QA regravado", visitante: v11, esperado: "B" });

		// 12 · metadata com valor fora da allowlist ⇒ sem variante, sem lançar.
		const v12 = visitante("valor-invalido");
		await semear({ visitante: v12, conversas: [{ em: DENTRO, variante: "C" }] });
		casos.push({ nome: 'metadata com "C"', visitante: v12, esperado: null });

		// 13 · a identidade tem UM dono: o contato funde dois visitantes.
		//      O visitante web A identificou; a conversa do outro visitante é do
		//      MESMO contato, no braço B. A pessoa é UMA — e a âncora vence.
		const [contato] = await db
			.insert(schema.contacts)
			.values({ phone: "5500900000009" })
			.returning({ id: schema.contacts.id });
		if (!contato) throw new Error("falha ao semear o contato");
		contactIds.push(contato.id);
		pessoaComContato = visitante("contato-a");
		outroVisitanteDoContato = visitante("contato-b");
		await semear({
			visitante: pessoaComContato,
			conversas: [{ em: DENTRO, variante: "A", identificada: true, contatoId: contato.id }],
		});
		await semear({
			visitante: outroVisitanteDoContato,
			conversas: [{ em: DEPOIS, variante: "B", contatoId: contato.id }],
		});
	});

	afterAll(async () => {
		if (!db) return;
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
		if (contactIds.length > 0) {
			await db.delete(schema.contacts).where(inArray(schema.contacts.id, contactIds));
		}
	});

	it("a escalar e a CTE concordam em TODOS os casos", async () => {
		const vereditos = await Promise.all(
			casos.map(async (caso) => ({ caso, veredito: await braco(caso.visitante) })),
		);
		for (const { caso, veredito } of vereditos) {
			expect({ nome: caso.nome, escalar: veredito.escalar }).toEqual({
				nome: caso.nome,
				escalar: caso.esperado,
			});
			expect({ nome: caso.nome, cte: veredito.cte }).toEqual({
				nome: caso.nome,
				cte: caso.esperado,
			});
		}
	});

	it("no empate de created_at, o id ASC decide — nas duas formas", async () => {
		const veredito = await braco(pessoaDoEmpate);
		expect(veredito.escalar).toBe(varianteDoMenorId);
		expect(veredito.cte).toBe(varianteDoMenorId);
	});

	it("o contato funde dois visitantes: a âncora da identificação vence", async () => {
		// Sem o lado do CONTATO na correlação, o segundo visitante só enxergaria a
		// própria conversa B e a mesma pessoa contaria em dois baldes.
		const veredito = await braco(outroVisitanteDoContato);
		expect(veredito.escalar).toBe("A");
		expect(veredito.cte).toBe("A");
	});

	it("A + B + sem variante = total de pessoas — nas duas formas", async () => {
		const baldes = { escalar: { A: 0, B: 0, sem: 0 }, cte: { A: 0, B: 0, sem: 0 } };
		for (const pessoa of pessoas) {
			const veredito = await braco(pessoa);
			for (const forma of ["escalar", "cte"] as const) {
				const b = veredito[forma];
				if (b === null) baldes[forma].sem += 1;
				else if (b === "A") baldes[forma].A += 1;
				else if (b === "B") baldes[forma].B += 1;
				else throw new Error(`braço inesperado: ${b}`);
			}
		}

		for (const forma of ["escalar", "cte"] as const) {
			const { A, B, sem } = baldes[forma];
			expect({ forma, total: A + B + sem }).toEqual({ forma, total: pessoas.length });
		}
	});

	it("contagensDoFunil com recorte EXECUTA e fecha A + B + sem = todas", async () => {
		const lista = sql.join(
			pessoas.map((pessoa) => sql`${pessoa}`),
			sql`, `,
		);

		// O FROM com os MESMOS aliases que o funil de mídia usa (`v`, `c`, `l`, `bp`).
		async function contar(recorte: ReturnType<typeof recorteDe>) {
			const resultado = await db.execute<Record<string, string>>(sql`
				SELECT ${contagensDoFunil(DE, ATE, recorte)}
				FROM visits v
				LEFT JOIN conversations c ON c.visit_id = v.id
				LEFT JOIN leads l ON l.conversation_id = c.id AND l.is_simulated = false
				LEFT JOIN bevi_proposals bp ON bp.conversation_id = c.id
				WHERE v.visitor_id IN (${lista})
			`);
			const linha = resultado.rows[0];
			if (!linha) throw new Error("a contagem devia devolver uma linha");
			return linha;
		}

		const todas = await contar([]);
		const colunas = [
			"visitas",
			"conversas",
			"com_contato",
			"identificados",
			"qualificados",
			"propostas",
			"fechados",
		] as const;

		// O funil tem que estar de pé no recorte (a escalar precisa rodar de verdade).
		expect(Number(todas.visitas)).toBeGreaterThan(0);
		expect(Number(todas.identificados)).toBeGreaterThan(0);

		const porBraco = {
			A: await contar(recorteDe("A")),
			B: await contar(recorteDe("B")),
			sem: await contar(recorteDe("sem-variante")),
		};

		for (const coluna of colunas) {
			const soma =
				Number(porBraco.A[coluna]) + Number(porBraco.B[coluna]) + Number(porBraco.sem[coluna]);
			expect({ coluna, soma }).toEqual({ coluna, soma: Number(todas[coluna]) });
		}
	});

	it("o predicado de recorte conta o mesmo que a escalar, na consulta de verdade", async () => {
		const condicao = condicaoDeBracoDaPessoa(recorteDe("A"), {
			de: DE,
			ate: ATE,
			chave: chaveDaPessoa(DE, ATE, sql`v.visitor_id`),
			colunaVisitor: sql`v.visitor_id`,
		});
		if (!condicao) throw new Error("o recorte A devia produzir condição");

		const lista = sql.join(
			pessoas.map((pessoa) => sql`${pessoa}`),
			sql`, `,
		);
		const resultado = await db.execute<{ total: string }>(sql`
			SELECT count(DISTINCT v.visitor_id) AS total
			FROM visits v
			WHERE v.visitor_id IN (${lista}) AND ${condicao}
		`);

		const esperados: string[] = [];
		for (const pessoa of pessoas) {
			if ((await bracoEscalar(pessoa)) === "A") esperados.push(pessoa);
		}

		expect(Number(resultado.rows[0]?.total ?? 0)).toBe(esperados.length);
	});

	it("o recorte vazio (todas) não devolve condição — nenhum SQL novo entra", () => {
		expect(condicaoDeBracoNaConversa([])).toBeNull();
		expect(
			condicaoDeBracoDaPessoa([], {
				de: DE,
				ate: ATE,
				chave: sql`v.visitor_id`,
				colunaVisitor: sql`v.visitor_id`,
			}),
		).toBeNull();
		expect(
			recorteDaRequisicao(new Request(`http://test/api?${PARAMETRO_DO_RECORTE_AB}=inventado:Z`)),
		).toEqual([]);
	});

	it("contagensDoFunil sem recorte gera o MESMO SQL de antes (nenhum SQL novo)", () => {
		// `queryChunks` é a árvore de fragmentos do drizzle — comparar chunk a
		// chunk prova que o recorte vazio não introduziu NADA.
		const semRecorte = JSON.stringify(contagensDoFunil(DE, ATE).queryChunks);
		const comRecorteVazio = JSON.stringify(contagensDoFunil(DE, ATE, []).queryChunks);

		expect(comRecorteVazio).toBe(semRecorte);
		expect(semRecorte).not.toContain(CHAVE);
		expect(semRecorte).not.toContain("braco_da_pessoa");
	});
});
