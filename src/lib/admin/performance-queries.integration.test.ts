// Funil de mídia e desempenho por origem (integration-db).
//
// Os números daqui decidem onde a verba vai. Testar contra Postgres real, com
// dados semeados numa JANELA DE DATA ISOLADA (2019) — assim o que já existe no
// banco do workspace não entra na conta e a asserção pode ser exata, não "maior
// que zero".
//
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const JANELA_DE = new Date("2019-03-01T00:00:00Z");
const JANELA_ATE = new Date("2019-03-31T23:59:59Z");
const DENTRO = new Date("2019-03-15T12:00:00Z");

describeIfDb("performance — funil de mídia (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./performance-queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./performance-queries");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	/** Um navegador de verdade — é o que a semeadura representa por padrão. */
	const UA_GENTE =
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

	interface Semente {
		utmSource?: string;
		utmCampaign?: string;
		utmContent?: string;
		ctwaSourceId?: string;
		ctwaHeadline?: string;
		referrer?: string;
		/** Sobrescreve o user-agent — é assim que se semeia um robô. */
		userAgent?: string | null;
		/** Até onde esta jornada chegou. */
		ate: "visita" | "conversa" | "engajou" | "oferta" | "identificou" | "proposta" | "fechou";
		simulada?: boolean;
	}

	async function semear(semente: Semente): Promise<string> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: `v-${crypto.randomUUID()}`,
				channel: "web",
				createdAt: DENTRO,
				userAgent: semente.userAgent === undefined ? UA_GENTE : semente.userAgent,
				utmSource: semente.utmSource ?? null,
				utmCampaign: semente.utmCampaign ?? null,
				utmContent: semente.utmContent ?? null,
				ctwaSourceId: semente.ctwaSourceId ?? null,
				ctwaHeadline: semente.ctwaHeadline ?? null,
				referrer: semente.referrer ?? null,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);
		if (semente.ate === "visita") return visita.id;

		const simulada = semente.simulada ?? false;
		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId: visita.id,
				isSimulated: simulada,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);
		if (semente.ate === "conversa") return visita.id;

		const [mensagem] = await db
			.insert(schema.messages)
			.values({
				conversationId: conversa.id,
				role: "user",
				content: "quero um carro",
				createdAt: DENTRO,
			})
			.returning({ id: schema.messages.id });
		if (semente.ate === "engajou") return visita.id;

		// Identificação vem ANTES da oferta: a Bevi exige CPF pra simular, então
		// quem vê número já deixou contato. O seed segue a jornada real do produto
		// — inverter aqui produziria um funil que cresce, que é justamente o
		// defeito que esta ordem previne.
		const fechou = semente.ate === "fechou";
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conversa.id,
				name: "Cliente Teste",
				phone: "+5511900000000",
				stage: fechou ? "fechado_ganho" : "qualificado",
				isSimulated: simulada,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.leads.id });
		if (semente.ate === "identificou") return visita.id;

		await db
			.insert(schema.artifacts)
			.values({ messageId: mensagem.id, type: "real_offer", payload: {}, createdAt: DENTRO });
		if (semente.ate === "oferta") return visita.id;

		await db.insert(schema.beviProposals).values({
			conversationId: conversa.id,
			leadId: lead.id,
			proposalId: `prop-${crypto.randomUUID()}`,
			createdAt: DENTRO,
			updatedAt: DENTRO,
		});
		return visita.id;
	}

	describe("computeFunilMidia", () => {
		beforeAll(async () => {
			// Uma jornada por profundidade — o funil tem que decrescer certinho.
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "visita" });
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "conversa" });
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "engajou" });
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "identificou" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "oferta" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "proposta" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "fechou" });
			// A simulada NÃO pode aparecer em lugar nenhum.
			await semear({ utmSource: "interno", ate: "fechou", simulada: true });
		});

		it("conta cada etapa a partir da tabela dona do fato", async () => {
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
			const por = Object.fromEntries(funil.map((e) => [e.chave, e.count]));

			expect(por.visitas).toBe(8);
			// A conversa simulada existe mas está fora: 7 semeadas, 1 é simulada.
			expect(por.conversas).toBe(6);
			expect(por.engajadas).toBe(5);
			expect(por.identificados).toBe(4);
			expect(por.viram_oferta).toBe(3);
			expect(por.propostas).toBe(2);
			expect(por.fechados).toBe(1);
		});

		it("calcula a queda de cada etapa em relação à anterior", async () => {
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
			const conversas = funil.find((e) => e.chave === "conversas");

			// 8 visitas → 6 conversas = 25% de perda.
			expect(conversas?.quedaDaAnterior).toBeCloseTo(25, 1);
			expect(conversas?.percentDoTopo).toBeCloseTo(75, 1);
		});

		it("não deixa a primeira etapa acusar queda", async () => {
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);

			expect(funil[0].quedaDaAnterior).toBe(0);
			expect(funil[0].percentDoTopo).toBe(100);
		});

		it("diz quantas conversas PARARAM em cada etapa, em absoluto", async () => {
			// A semeadura é uma jornada por profundidade, então cada etapa tem
			// exatamente uma conversa que morreu ali. "8 pararam aqui" é o que se
			// conserta; "44,4% saíram" sobre 18 conversas é precisão falsa.
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
			const por = Object.fromEntries(funil.map((e) => [e.chave, e.pararamAqui]));

			expect(por.conversas).toBe(1); // abriu e não escreveu
			expect(por.engajadas).toBe(1); // escreveu e não se identificou
			expect(por.identificados).toBe(1);
			expect(por.viram_oferta).toBe(1);
			expect(por.propostas).toBe(1);
			expect(por.fechados).toBe(1);
		});

		it("as paradas somam o total de conversas — ninguém fica de fora", async () => {
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
			const conversas = funil.find((e) => e.chave === "conversas")?.count ?? 0;
			const somaDasParadas = funil.reduce((acc, e) => acc + e.pararamAqui, 0);

			expect(somaDasParadas).toBe(conversas);
		});

		it("conversa semeada no passado não conta como viva", async () => {
			// A semeadura é de 2019: nenhuma tem mensagem recente do cliente, então
			// todas estão mortas. É o caso que separa "conserte o agente" de "puxe
			// de volta" — e sem a janela de tempo tudo pareceria retomável.
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
			expect(funil.every((e) => e.aindaVivas === 0)).toBe(true);
		});

		it("mede as etapas da conversa contra as CONVERSAS, não contra as visitas", async () => {
			// É o conserto do desenho: contra visitas, 6 de 8 já seria 75% e as
			// etapas de baixo virariam lascas iguais. Contra conversas, o topo do
			// funil de produto é 100%.
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
			const conversas = funil.find((e) => e.chave === "conversas");
			const identificados = funil.find((e) => e.chave === "identificados");

			expect(conversas?.percentDasConversas).toBe(100);
			// 4 identificados de 6 conversas.
			expect(identificados?.percentDasConversas).toBeCloseTo(66.7, 1);
		});

		it("nunca cresce de uma etapa pra outra", async () => {
			// Este é o defeito que só apareceu na TELA: com conversa sem origem
			// entrando no funil, "Conversas" dava 328% de "Visitas" e a barra
			// estourava a caixa. Um funil que cresce não é funil.
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);

			for (let i = 1; i < funil.length; i++) {
				expect(
					funil[i].count,
					`"${funil[i].label}" (${funil[i].count}) não pode passar de "${funil[i - 1].label}" (${funil[i - 1].count})`,
				).toBeLessThanOrEqual(funil[i - 1].count);
				expect(funil[i].percentDoTopo).toBeLessThanOrEqual(100);
			}
		});

		it("não conta conversa sem origem — ela não nasceu de uma visita", async () => {
			// WhatsApp orgânico e conversa anterior à instrumentação existem no
			// negócio, mas não pertencem ao funil de MÍDIA.
			const antes = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);

			const [orfa] = await db
				.insert(schema.conversations)
				.values({ channel: "whatsapp", visitId: null, createdAt: DENTRO, updatedAt: DENTRO })
				.returning({ id: schema.conversations.id });
			await db.insert(schema.messages).values({
				conversationId: orfa.id,
				role: "user",
				content: "oi",
				createdAt: DENTRO,
			});

			try {
				const depois = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
				const conversas = (f: typeof depois) => f.find((e) => e.chave === "conversas")?.count;
				const engajadas = (f: typeof depois) => f.find((e) => e.chave === "engajadas")?.count;

				expect(conversas(depois)).toBe(conversas(antes));
				expect(engajadas(depois)).toBe(engajadas(antes));
			} finally {
				// Limpa aqui, e não no afterAll: esta conversa sem origem mudaria a
				// cobertura e a série dos outros testes desta mesma janela.
				await db.delete(schema.conversations).where(eq(schema.conversations.id, orfa.id));
			}
		});

		it("põe a identificação ANTES da oferta — nesta jornada o CPF vem primeiro", async () => {
			// A Bevi exige CPF pra simular, então o cliente se identifica antes de
			// ver número. Com a ordem genérica de e-commerce, a tela mostrava
			// "Se identificaram" com o dobro de "Viram oferta".
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
			const chaves = funil.map((e) => e.chave);

			expect(chaves.indexOf("identificados")).toBeLessThan(chaves.indexOf("viram_oferta"));
		});

		it("devolve o funil inteiro zerado quando não houve nada no período", async () => {
			const vazio = await queries.computeFunilMidia(
				new Date("2018-01-01T00:00:00Z"),
				new Date("2018-01-31T00:00:00Z"),
			);

			expect(vazio.every((e) => e.count === 0 && e.percentDoTopo === 0)).toBe(true);
		});
	});

	describe("robô declarado não entra no denominador", () => {
		// O caso real: em 15/08/2026, 38.792 das 40.796 visitas de 30 dias em
		// produção eram máquina — 33.382 só do health check do nosso ALB, que bate
		// em `/` a cada 30 s. A tela mostrava 0,056% de visita → conversa; a taxa
		// sobre gente era 1,15%. O proxy já não grava mais, mas o histórico
		// gravado só fica legível se a LEITURA também classificar.
		const idsRobo: string[] = [];

		beforeAll(async () => {
			idsRobo.push(await semear({ userAgent: "ELB-HealthChecker/2.0", ate: "visita" }));
			idsRobo.push(await semear({ userAgent: "facebookexternalhit/1.1", ate: "visita" }));
			idsRobo.push(await semear({ userAgent: null, ate: "visita" }));
		});

		afterAll(async () => {
			await db.delete(schema.visits).where(inArray(schema.visits.id, idsRobo));
		});

		it("não conta health check nem crawler como chegada", async () => {
			// As 8 visitas de gente da semeadura continuam; as 3 de máquina não
			// entram, mesmo estando na tabela.
			const porta = await queries.computePorta(JANELA_DE, JANELA_ATE);
			expect(porta.visitas).toBe(8);
		});

		it("mantém o topo do funil e a série livres de robô", async () => {
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE);
			expect(funil.find((e) => e.chave === "visitas")?.count).toBe(8);

			const serie = await queries.computeSerie(JANELA_DE, JANELA_ATE);
			const totalVisitas = serie.reduce((acc, p) => acc + p.visitas, 0);
			expect(totalVisitas).toBe(8);
		});

		it("não deixa robô inflar a tabela por origem", async () => {
			const origens = await queries.computeOrigens(JANELA_DE, JANELA_ATE);
			const total = origens.reduce((acc, o) => acc + o.visitas, 0);
			expect(total).toBe(8);
		});

		it("visita que PRODUZIU conversa conta, qualquer que seja o user-agent", async () => {
			// A âncora que impede o erro caro: fato do servidor vence heurística.
			// Um cliente atrás de proxy corporativo pode chegar com user-agent
			// esquisito — se ele conversou, ele é gente, e descartá-lo apagaria a
			// venda do relatório.
			const convAntes = convIds.length;
			const idAncorado = await semear({
				userAgent: "python-requests/2.31.0",
				utmSource: "facebook",
				utmCampaign: "camp-a",
				ate: "engajou",
			});
			try {
				const porta = await queries.computePorta(JANELA_DE, JANELA_ATE);
				expect(porta.visitas).toBe(9);
				expect(porta.conversas).toBe(7);
			} finally {
				// A conversa sai JUNTO com a visita: deixá-la viva mudaria a cobertura
				// de atribuição dos outros testes desta mesma janela.
				const criadas = convIds.splice(convAntes);
				if (criadas.length > 0) {
					await db.delete(schema.conversations).where(inArray(schema.conversations.id, criadas));
				}
				await db.delete(schema.visits).where(inArray(schema.visits.id, [idAncorado]));
			}
		});
	});

	describe("computePorta", () => {
		it("separa o limiar de entrada do funil de conversa", async () => {
			// A porta responde outra pergunta, com outro denominador: quantas
			// chegadas viraram conversa. 6 de 8 = 75%.
			const porta = await queries.computePorta(JANELA_DE, JANELA_ATE);

			expect(porta.visitas).toBe(8);
			expect(porta.conversas).toBe(6);
			expect(porta.taxaDeEntrada).toBeCloseTo(75, 1);
		});

		it("diz por qual porta a conversa entrou — web e WhatsApp", async () => {
			// O split por canal era um gráfico de duas barras: duas categorias não
			// são um gráfico, são uma frase. Como frase ele cabe aqui e o dado não
			// sai da tela junto com o gráfico.
			const [wpp] = await db
				.insert(schema.conversations)
				.values({
					// Reaproveita uma visita já semeada de propósito: assim o total de
					// CHEGADAS não muda e a asserção isola o que está sendo medido.
					visitId: visitIds[0],
					channel: "whatsapp",
					isSimulated: false,
					createdAt: DENTRO,
					updatedAt: DENTRO,
				})
				.returning({ id: schema.conversations.id });

			try {
				const porta = await queries.computePorta(JANELA_DE, JANELA_ATE);

				expect(porta.conversas).toBe(7);
				expect(porta.web).toBe(6);
				expect(porta.whatsapp).toBe(1);
				// A soma das portas é o total: conversa que entrou por um canal que
				// ninguém previu não pode sumir da conta.
				expect(porta.web + porta.whatsapp).toBe(porta.conversas);
			} finally {
				// Limpa aqui, e não no afterAll: esta conversa a mais mudaria a
				// contagem exata dos outros testes desta mesma janela.
				await db.delete(schema.conversations).where(eq(schema.conversations.id, wpp.id));
			}
		});
	});

	describe("computeOrigens", () => {
		it("agrupa por campanha e calcula visita → contrato", async () => {
			const origens = await queries.computeOrigens(JANELA_DE, JANELA_ATE);
			const google = origens.find((o) => o.origem.label === "google · camp-b");

			expect(google).toMatchObject({ visitas: 3, conversas: 3, fechados: 1 });
			// 1 fechado em 3 visitas.
			expect(google?.taxaFechamento).toBeCloseTo(33.3, 1);
		});

		it("separa campanhas diferentes", async () => {
			const origens = await queries.computeOrigens(JANELA_DE, JANELA_ATE);

			expect(origens.find((o) => o.origem.label === "facebook · camp-a")).toMatchObject({
				visitas: 4,
				fechados: 0,
			});
		});

		it("não conta lead nem conversa simulada no desempenho da origem", async () => {
			const origens = await queries.computeOrigens(JANELA_DE, JANELA_ATE);
			const interno = origens.find((o) => o.origem.label === "interno");

			// A visita conta (ela aconteceu), mas a conversa e o fechamento simulados não.
			expect(interno).toMatchObject({ visitas: 1, conversas: 0, fechados: 0 });
		});

		it("ordena da origem que mais trouxe visita pra que menos trouxe", async () => {
			const origens = await queries.computeOrigens(JANELA_DE, JANELA_ATE);
			const visitas = origens.map((o) => o.visitas);

			expect([...visitas].sort((a, b) => b - a)).toEqual(visitas);
		});
	});

	describe("computeCobertura", () => {
		it("mede quanto do funil tem origem conhecida", async () => {
			const cobertura = await queries.computeCobertura(JANELA_DE, JANELA_ATE);

			// Todas as conversas da janela nasceram de visita semeada.
			expect(cobertura).toMatchObject({ conversasComOrigem: 6, conversasTotal: 6, percent: 100 });
		});

		it("não divide por zero em período sem conversa", async () => {
			const cobertura = await queries.computeCobertura(
				new Date("2018-01-01T00:00:00Z"),
				new Date("2018-01-31T00:00:00Z"),
			);

			expect(cobertura).toEqual({ conversasComOrigem: 0, conversasTotal: 0, percent: 0 });
		});
	});

	describe("computeSerie", () => {
		// Meio-dia UTC de propósito: é o único horário que cai no mesmo dia
		// calendário em UTC e em São Paulo, então a asserção não fica refém do
		// fuso de quem roda o teste.
		const DE = new Date("2019-03-14T12:00:00Z");
		const ATE = new Date("2019-03-16T12:00:00Z");

		it("preenche dia sem movimento com zero, pra a linha não pular o buraco", async () => {
			const serie = await queries.computeSerie(DE, ATE);

			expect(serie).toHaveLength(3);
			expect(serie.map((p) => p.date)).toEqual(["2019-03-14", "2019-03-15", "2019-03-16"]);
			expect(serie[0]).toMatchObject({ visitas: 0, conversas: 0, identificados: 0 });
		});

		it("credita o movimento no dia certo", async () => {
			const serie = await queries.computeSerie(DE, ATE);
			const dia15 = serie.find((p) => p.date === "2019-03-15");

			// Mesma população do funil de mídia — a série não pode contar diferente
			// do bloco logo acima dela na tela.
			expect(dia15).toMatchObject({ visitas: 8, conversas: 6, identificados: 4 });
		});

		it("conta o dia no fuso de Brasília, não em UTC", async () => {
			// 2019-03-16T02:00Z é 15/03 às 23h em São Paulo — o dia do NEGÓCIO ainda
			// é 15. Ler em UTC jogaria o movimento da madrugada pro dia seguinte e
			// faria o relatório do dia fechar diferente do que a operação viveu.
			const serie = await queries.computeSerie(
				new Date("2019-03-14T12:00:00Z"),
				new Date("2019-03-16T02:00:00Z"),
			);

			expect(serie.map((p) => p.date)).toEqual(["2019-03-14", "2019-03-15"]);
		});
	});
});
