/**
 * O ECO DA VISITA, e a invariante que ele quebrava (integration-db).
 *
 * ── O defeito ────────────────────────────────────────────────────────────────
 *
 * Depois de hidratar, o App Router dispara `fetch` de prefetch para a própria
 * rota, levando junto a query string da página. Como a URL de anúncio traz UTM,
 * e `decideVisit` abria visita nova sempre que havia campanha, cada prefetch
 * virava uma chegada. Reproduzido duas vezes no navegador em 24/08/2026: UMA
 * navegação, QUATRO linhas em `visits`. Em produção, naquele dia, 390 das 756
 * chegadas eram eco — 51,6% —, e só no tráfego pago.
 *
 * `proxy.ts` parou de gravar o eco (ver `proxy.prefetch-nao-e-chegada.test.ts`).
 * Este arquivo cobre o outro lado: a LEITURA, que precisa continuar limpando o
 * histórico de 13/08 em diante, já gravado.
 *
 * ── O erro que quase se cometeu no lugar ─────────────────────────────────────
 *
 * A primeira tentativa filtrou o eco no CTE de visitas, o que parece a correção
 * óbvia e teria estragado a tela de outro jeito: **o comportamento está gravado
 * no eco**, não na visita original. O cookie da sessão termina apontando para a
 * última visita da rajada, então é ela que o coletor carimba nos eventos e é ela
 * que a conversa referencia. Medido em produção (13/08 a 24/08): das 566 visitas
 * com evento, 406 eram eco; das 47 com conversa, 18. O filtro cego derrubaria 49
 * das 77 pessoas do degrau "Olhou a página" — e o painel teria trocado um número
 * inflado por um número mudo.
 *
 * Daí a regra que os casos abaixo fixam: **o eco sai da CONTAGEM e fica na
 * LEITURA DOS SINAIS.** Os dois últimos testes são os que doem se alguém
 * "simplificar" isso.
 *
 * Janela isolada em 2017 para não misturar com o que já existe no banco.
 */

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const JANELA_DE = new Date("2017-05-01T00:00:00Z");
const JANELA_ATE = new Date("2017-05-31T23:59:59Z");
const CHEGADA = new Date("2017-05-10T12:00:00Z");

const UA_GENTE =
	"Mozilla/5.0 (Linux; Android 16; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36";

describeIfDb("o eco da visita (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let performance: typeof import("./performance-queries");
	let percurso: typeof import("./percurso-queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		performance = await import("./performance-queries");
		percurso = await import("./percurso-queries");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.pageEvents).where(inArray(schema.pageEvents.visitId, visitIds));
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	/**
	 * Uma chegada de anúncio como ela acontece: a navegação de verdade e, logo
	 * atrás, os prefetches do roteador. Os deslocamentos são os medidos no
	 * navegador — 1,4s até o primeiro e milissegundos entre eles.
	 */
	async function semearRajada(visitorId: string): Promise<string[]> {
		const deslocamentos = [0, 1_400, 1_410, 1_420];
		const ids: string[] = [];

		for (const ms of deslocamentos) {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId,
					channel: "web",
					landingPath: "/",
					createdAt: new Date(CHEGADA.getTime() + ms),
					userAgent: UA_GENTE,
					utmSource: "ig",
					utmMedium: "paid",
					utmContent: "eco-teste",
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);
			ids.push(visita.id);
		}

		return ids;
	}

	async function lerPorta() {
		return performance.computePorta(JANELA_DE, JANELA_ATE);
	}

	async function lerPercurso() {
		return percurso.listarPercurso({ from: JANELA_DE, to: JANELA_ATE, limit: 50, offset: 0 });
	}

	it("conta UMA chegada onde há quatro linhas — e uma pessoa só", async () => {
		await semearRajada(`eco-${crypto.randomUUID()}`);

		const porta = await lerPorta();

		expect(porta.visitas).toBe(1);
		expect(porta.pessoas).toBe(1);
	});

	it("o Percurso conta a mesma chegada e a mesma pessoa", async () => {
		const resposta = await lerPercurso();

		expect(resposta.totalDeChegadas).toBe(1);
		expect(resposta.totalDePessoas).toBe(1);
	});

	it("Performance e Percurso fecham no MESMO número de pessoas", async () => {
		// A invariante que o painel quebrava: três telas, três números, todos
		// apresentados como "quanta gente chegou". Se um dia alguém mudar a chave
		// de pessoa num arquivo só, é aqui que aparece.
		//
		// Este é o ÚNICO caso do arquivo que continua verde com a deduplicação
		// desligada (conferido em 24/08/2026, revertendo o fix e re-rodando), e a
		// razão é instrutiva: sem o fix as duas telas erram pelo MESMO fator, então
		// concordam. Concordância entre telas prova consistência, nunca correção —
		// é por isso que os outros quatro casos existem, cada um ancorado num fato
		// semeado e não na comparação de uma tela com a outra.
		const [porta, resposta] = await Promise.all([lerPorta(), lerPercurso()]);

		expect(porta.pessoas).toBe(resposta.totalDePessoas);
		expect(porta.visitas).toBe(resposta.totalDeChegadas);
	});

	it("o sinal de leitura gravado NO ECO continua contando para a pessoa", async () => {
		// O caso que o filtro cego apagava. A rolagem é gravada na ÚLTIMA visita da
		// rajada, porque é para ela que o cookie aponta quando o coletor dispara.
		const visitorId = `eco-sinal-${crypto.randomUUID()}`;
		const ids = await semearRajada(visitorId);
		const ultimoEco = ids[ids.length - 1];

		await db.insert(schema.pageEvents).values({
			visitId: ultimoEco,
			type: "scroll_depth",
			path: "/",
			scrollPct: 75,
			viewportWidth: 390,
			viewportHeight: 844,
			device: "mobile",
			createdAt: new Date(CHEGADA.getTime() + 5_000),
		});

		const resposta = await lerPercurso();
		const pessoa = resposta.pessoas.find((p) => p.visitorId === visitorId);

		expect(pessoa).toBeDefined();
		expect(pessoa?.passo).toBe("olhou_a_pagina");
		// E a chegada dela continua sendo UMA, não quatro.
		expect(pessoa?.chegadas).toBe(1);
	});

	it("a conversa ligada AO ECO não some da tabela por origem", async () => {
		// O outro lado do mesmo erro: a conversa nasce apontando para a visita que
		// o cookie tinha na mão — o eco. Filtrar as linhas em vez de filtrar a
		// contagem faria a campanha aparecer com chegadas e zero conversa, que é
		// exatamente o retrato que manda desligar um anúncio que está vendendo.
		const visitorId = `eco-conversa-${crypto.randomUUID()}`;
		const ids = await semearRajada(visitorId);

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId: ids[ids.length - 1],
				isSimulated: false,
				createdAt: new Date(CHEGADA.getTime() + 9_000),
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		const origens = await performance.computeOrigens(JANELA_DE, JANELA_ATE);
		const linha = origens.find((o) => o.origem.label.includes("ig"));

		expect(linha).toBeDefined();
		expect(linha?.conversas).toBeGreaterThanOrEqual(1);
		// Três pessoas semeadas até aqui, uma chegada cada — nunca quatro.
		expect(linha?.visitas).toBe(3);
	});
});
