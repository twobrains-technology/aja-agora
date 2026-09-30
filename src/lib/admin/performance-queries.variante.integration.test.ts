// O RECORTE POR BRAÇO DE EXPERIMENTO nas telas de Performance (integration-db).
//
// O que este arquivo protege é o fechamento do painel sob recorte — a promessa
// que o dono pediu: *"a etapa que o cliente avançou, ele veio por qual A/B?"*.
// Com o recorte ativo, `A + B + sem variante = total` tem que fechar em CADA
// degrau do funil, nas Origens e na Porta, e a cadeia do funil não pode crescer.
// Sem recorte, nenhum número pode se mover (C4).
//
// Contra Postgres real porque o que pode divergir é o SQL: a contagem por pessoa
// sai de `chaveDaPessoa` e o recorte entra como subconsulta correlacionada POR
// LINHA. Um mock não veria a diferença — e a diferença é a partição.
//
// Os dados são semeados numa JANELA ISOLADA (agosto de 2019, livre em todo o
// repo) para que o que já existe no banco do workspace não entre na conta e a
// asserção possa ser exata.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/variante-da-visita";
import { SEM_BRACO } from "@/lib/experimentos/registro";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const JANELA_DE = new Date("2019-08-01T00:00:00Z");
const JANELA_ATE = new Date("2019-08-31T23:59:59Z");
const DENTRO = new Date("2019-08-15T12:00:00Z");
const CINCO_MINUTOS_DEPOIS = new Date("2019-08-15T12:05:00Z");

/** O recorte de UM braço, no formato que as queries consomem. */
const recorteDe = (braco: string) => [{ experimento: CHAVE_DO_TESTE_NO_METADATA, braco }];

/** Os três baldes que têm que somar o total. */
const BALDES = ["A", "B", SEM_BRACO] as const;

/** A cadeia do funil — os degraus que se sucedem (a ramificação fica fora). */
const CADEIA_DO_FUNIL = [
	"conversas",
	"engajadas",
	"identificados",
	"viram_oferta",
	"propostas",
	"fechados",
] as const;

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

describeIfDb("performance — recorte por braço de experimento (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./performance-queries");
	let handoffQueries: typeof import("./handoff-queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const msgIds: string[] = [];
	const leadIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./performance-queries");
		handoffQueries = await import("./handoff-queries");

		/**
		 * Até onde a jornada desta pessoa chegou.
		 *
		 * `engajou` = o cliente ESCREVEU algo próprio (o degrau do AJA-01, e o que
		 * separa "iniciou a conversa" de "só mandou o texto do anúncio").
		 */
		async function semear(semente: {
			/** O `visitor_id` — repetir o mesmo funde as conversas numa PESSOA. */
			visitante: string;
			/** O valor gravado no metadata. `"C"` é o caso fora da allowlist. */
			braco?: string | null;
			ate: "engajou" | "identificou" | "oferta" | "proposta";
			canal?: "web" | "whatsapp";
			waId?: string | null;
			criadoEm?: Date;
		}): Promise<void> {
			const criadoEm = semente.criadoEm ?? DENTRO;
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: semente.visitante,
					channel: semente.canal ?? "web",
					createdAt: criadoEm,
					userAgent: UA_GENTE,
					utmSource: "facebook",
					utmCampaign: "camp-variante",
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);

			const [conversa] = await db
				.insert(schema.conversations)
				.values({
					channel: semente.canal ?? "web",
					visitId: visita.id,
					waId: semente.waId ?? null,
					isSimulated: false,
					metadata: {
						currentCategory: "auto",
						...(semente.braco ? { [CHAVE_DO_TESTE_NO_METADATA]: { variante: semente.braco } } : {}),
					},
					createdAt: criadoEm,
					updatedAt: criadoEm,
				})
				.returning({ id: schema.conversations.id });
			convIds.push(conversa.id);

			const [mensagem] = await db
				.insert(schema.messages)
				.values({
					conversationId: conversa.id,
					role: "user",
					content: "quero um carro",
					channel: semente.canal ?? "web",
					createdAt: criadoEm,
				})
				.returning({ id: schema.messages.id });
			msgIds.push(mensagem.id);
			if (semente.ate === "engajou") return;

			// Identificação vem ANTES da oferta: a Bevi exige CPF para simular.
			const [lead] = await db
				.insert(schema.leads)
				.values({
					conversationId: conversa.id,
					name: "Cliente do Recorte",
					phone: "+5511900000000",
					stage: "qualificado",
					isSimulated: false,
					createdAt: criadoEm,
					updatedAt: criadoEm,
				})
				.returning({ id: schema.leads.id });
			leadIds.push(lead.id);

			// A trilha que o funil de handoff lê — sem ela o lead não ALCANÇOU
			// estágio nenhum e a partição do handoff seria vacuamente verde.
			await db.insert(schema.leadEvents).values({
				leadId: lead.id,
				fromStage: "novo",
				toStage: "qualificado",
				actorType: "system",
				createdAt: criadoEm,
			});
			if (semente.ate === "identificou") return;

			await db.insert(schema.artifacts).values({
				messageId: mensagem.id,
				type: "real_offer",
				payload: {},
				createdAt: criadoEm,
			});
			if (semente.ate === "oferta") return;

			await db.insert(schema.beviProposals).values({
				conversationId: conversa.id,
				leadId: lead.id,
				proposalId: `prop-${crypto.randomUUID()}`,
				createdAt: criadoEm,
				updatedAt: criadoEm,
			});
		}

		// ── As pessoas do recorte ────────────────────────────────────────────
		// Uma por balde, mais os dois casos que decidem a REGRA: a pessoa que
		// identificou em A e só depois abriu B (fica em A), e o metadata fora da
		// allowlist (vira sem variante, nunca um quarto balde).

		// P1 — braço A, chegou até a proposta.
		await semear({ visitante: "p1", braco: "A", ate: "proposta" });
		// P2 — braço B, chegou até a oferta.
		await semear({ visitante: "p2", braco: "B", ate: "oferta" });
		// P3 — braço B, nunca se identificou (a EXPOSIÇÃO é o critério dela).
		await semear({ visitante: "p3", braco: "B", ate: "engajou" });
		// P4 — sem braço nenhum: conversa pré-teste.
		await semear({ visitante: "p4", ate: "engajou" });
		// P5 — metadata fora da allowlist ("C", aposentado no FIX-403).
		await semear({ visitante: "p5", braco: "C", ate: "engajou" });
		// P6 — WhatsApp: nasce identificada e NÃO participa do teste (D3).
		await semear({
			visitante: "p6",
			ate: "engajou",
			canal: "whatsapp",
			waId: "5511900000001",
		});
		// P7 — identificou na conversa A e só DEPOIS abriu uma conversa B: fica em
		// A (a âncora vence a exposição mais recente). É o caso que separa a regra
		// nova da antiga ("a última conversa com variante").
		await semear({ visitante: "p7", braco: "A", ate: "identificou", criadoEm: DENTRO });
		await semear({
			visitante: "p7",
			braco: "B",
			ate: "engajou",
			criadoEm: CINCO_MINUTOS_DEPOIS,
		});
	});

	afterAll(async () => {
		if (msgIds.length > 0) {
			await db.delete(schema.artifacts).where(inArray(schema.artifacts.messageId, msgIds));
			await db.delete(schema.messages).where(inArray(schema.messages.id, msgIds));
		}
		if (convIds.length > 0) {
			await db
				.delete(schema.beviProposals)
				.where(inArray(schema.beviProposals.conversationId, convIds));
		}
		if (leadIds.length > 0) {
			await db.delete(schema.leadEvents).where(inArray(schema.leadEvents.leadId, leadIds));
			await db.delete(schema.leads).where(inArray(schema.leads.id, leadIds));
		}
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	const porEtapa = (funil: Awaited<ReturnType<typeof queries.computeFunilMidia>>) =>
		Object.fromEntries(funil.map((e) => [e.chave, e.count])) as Record<string, number>;

	it("sem recorte, cada query devolve o MESMO que a chamada sem parâmetro (C4)", async () => {
		// A promessa do default "todas": o recorte vazio é byte a byte o caminho de
		// hoje — nenhum SQL novo entra, nenhum número se move.
		expect(await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, [])).toEqual(
			await queries.computeFunilMidia(JANELA_DE, JANELA_ATE),
		);
		expect(await queries.computePorta(JANELA_DE, JANELA_ATE, [])).toEqual(
			await queries.computePorta(JANELA_DE, JANELA_ATE),
		);
		expect(await queries.computeQuemChegou(JANELA_DE, JANELA_ATE, [])).toEqual(
			await queries.computeQuemChegou(JANELA_DE, JANELA_ATE),
		);
		expect(await queries.computeOrigens(JANELA_DE, JANELA_ATE, [])).toEqual(
			await queries.computeOrigens(JANELA_DE, JANELA_ATE),
		);
		expect(await queries.computeSerie(JANELA_DE, JANELA_ATE, [])).toEqual(
			await queries.computeSerie(JANELA_DE, JANELA_ATE),
		);
		expect(await queries.computeCobertura(JANELA_DE, JANELA_ATE, [])).toEqual(
			await queries.computeCobertura(JANELA_DE, JANELA_ATE),
		);
		expect(await queries.computeCustosDoCpc(JANELA_DE, JANELA_ATE, [])).toEqual(
			await queries.computeCustosDoCpc(JANELA_DE, JANELA_ATE),
		);
		// `parados` fica FORA da comparação: é a lista de quem está parado AGORA,
		// sem janela de período e sem ordem estável — compará-la entre duas chamadas
		// mediria a corrida do banco, não a equivalência do recorte.
		const handoffSemParametro = await handoffQueries.computeFunilDeHandoff(JANELA_DE, JANELA_ATE);
		const handoffComVazio = await handoffQueries.computeFunilDeHandoff(
			JANELA_DE,
			JANELA_ATE,
			undefined,
			[],
		);
		expect(handoffComVazio.etapas).toEqual(handoffSemParametro.etapas);
		expect(handoffComVazio.amostraSuficiente).toBe(handoffSemParametro.amostraSuficiente);
	});

	it("conta o recorte como o painel lê hoje, sem recorte", async () => {
		const funil = porEtapa(await queries.computeFunilMidia(JANELA_DE, JANELA_ATE));

		// 8 chegadas (P7 chegou duas vezes) e 7 pessoas.
		expect(funil.visitas).toBe(8);
		expect(funil.conversas).toBe(7);
		expect(funil.engajadas).toBe(7);
		expect(funil.identificados).toBe(4);
		expect(funil.viram_oferta).toBe(2);
		expect(funil.propostas).toBe(1);
		expect(funil.fechados).toBe(0);
	});

	it("fecha A + B + sem variante em CADA degrau do funil", async () => {
		const total = porEtapa(await queries.computeFunilMidia(JANELA_DE, JANELA_ATE));
		const porBalde = new Map<string, Record<string, number>>();
		for (const braco of BALDES) {
			porBalde.set(
				braco,
				porEtapa(await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, recorteDe(braco))),
			);
		}

		for (const braco of BALDES) {
			const doBraco = porBalde.get(braco) ?? {};
			for (const chave of Object.keys(total)) {
				expect(doBraco[chave], `"${chave}" no braço ${braco}`).toBeLessThanOrEqual(total[chave]);
			}
		}

		for (const chave of Object.keys(total)) {
			const soma = BALDES.reduce((acc, braco) => acc + (porBalde.get(braco)?.[chave] ?? 0), 0);
			expect(soma, `"${chave}" não fecha: A + B + sem variante`).toBe(total[chave]);
		}
	});

	it("atribui a pessoa pela conversa em que ela se IDENTIFICOU, não pela última", async () => {
		// P7 identificou na conversa A e abriu uma B depois. A regra antiga ("a
		// última conversa com variante") a colocaria em B; a regra vigente a deixa
		// em A — e é por isso que o balde A tem 2 identificados e o B, 1.
		const a = porEtapa(await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, recorteDe("A")));
		const b = porEtapa(await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, recorteDe("B")));
		const sem = porEtapa(
			await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, recorteDe(SEM_BRACO)),
		);

		expect(a.identificados).toBe(2); // P1 + P7
		expect(b.identificados).toBe(1); // P2
		expect(sem.identificados).toBe(1); // P6, o WhatsApp
		// A exposição mais recente NÃO contou para B.
		expect(b.conversas).toBe(2); // P2 + P3
		expect(a.conversas).toBe(2); // P1 + P7 (as duas visitas dela)
		expect(sem.conversas).toBe(3); // P4 + P5 + P6
	});

	it("não deixa o metadata fora da allowlist virar um quarto balde", async () => {
		// P5 tem `variante: "C"` no metadata. Ela cai em `sem variante` — se caísse
		// em nenhum balde, `A + B + sem variante = total` deixaria de fechar.
		const sem = porEtapa(
			await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, recorteDe(SEM_BRACO)),
		);
		const a = porEtapa(await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, recorteDe("A")));
		const b = porEtapa(await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, recorteDe("B")));

		expect(sem.engajadas).toBe(3); // P4 + P5 + P6
		expect(a.engajadas + b.engajadas + sem.engajadas).toBe(7);
	});

	it("mantém a cadeia do funil sem crescer, sob recorte", async () => {
		for (const braco of BALDES) {
			const funil = await queries.computeFunilMidia(JANELA_DE, JANELA_ATE, recorteDe(braco));
			const por = porEtapa(funil);
			for (let i = 1; i < CADEIA_DO_FUNIL.length; i++) {
				expect(
					por[CADEIA_DO_FUNIL[i]],
					`${CADEIA_DO_FUNIL[i]} passou de ${CADEIA_DO_FUNIL[i - 1]} no braço ${braco}`,
				).toBeLessThanOrEqual(por[CADEIA_DO_FUNIL[i - 1]]);
			}
		}
	});

	it("fecha a PORTA por balde, incluindo as conversas de cada canal", async () => {
		const total = await queries.computePorta(JANELA_DE, JANELA_ATE);
		expect(total.pessoas).toBe(7);
		expect(total.visitas).toBe(8);
		expect(total.pessoasQueConversaram).toBe(7);
		expect(total.conversas).toBe(8);
		expect(total.web).toBe(7);
		expect(total.whatsapp).toBe(1);

		const campos = [
			"pessoas",
			"visitas",
			"pessoasQueConversaram",
			"conversas",
			"web",
			"whatsapp",
		] as const;
		const porBalde = await Promise.all(
			BALDES.map(async (braco) => {
				const p = await queries.computePorta(JANELA_DE, JANELA_ATE, recorteDe(braco));
				return { braco, p };
			}),
		);

		for (const campo of campos) {
			const soma = porBalde.reduce((acc, { p }) => acc + p[campo], 0);
			expect(soma, `"${campo}" da Porta não fecha`).toBe(total[campo]);
		}
		const sem = porBalde.find((b) => b.braco === SEM_BRACO)?.p;
		expect(sem?.whatsapp).toBe(1); // o WhatsApp está em `sem variante`
	});

	it("fecha cada linha de ORIGEM por balde", async () => {
		const total = await queries.computeOrigens(JANELA_DE, JANELA_ATE);
		expect(total).toHaveLength(1);
		expect(total[0].visitas).toBe(8);
		expect(total[0].conversas).toBe(7);
		expect(total[0].identificados).toBe(4);
		expect(total[0].propostas).toBe(1);

		const campos = [
			"visitas",
			"conversas",
			"identificados",
			"comTelefone",
			"propostas",
			"fechados",
		] as const;
		const porBalde = await Promise.all(
			BALDES.map(async (braco) => ({
				braco,
				linhas: await queries.computeOrigens(JANELA_DE, JANELA_ATE, recorteDe(braco)),
			})),
		);

		for (const campo of campos) {
			const soma = porBalde.reduce(
				(acc, { linhas }) => acc + linhas.reduce((s, l) => s + l[campo], 0),
				0,
			);
			expect(soma, `"${campo}" das Origens não fecha`).toBe(total[0][campo]);
		}
	});

	it("fecha a SÉRIE do dia por balde", async () => {
		const total = await queries.computeSerie(JANELA_DE, JANELA_ATE);
		const doDia = total.find((p) => p.date === "2019-08-15");
		expect(doDia).toBeDefined();

		const porBalde = await Promise.all(
			BALDES.map(async (braco) => queries.computeSerie(JANELA_DE, JANELA_ATE, recorteDe(braco))),
		);
		for (const campo of ["visitas", "conversas", "identificados"] as const) {
			const soma = porBalde.reduce(
				(acc, pontos) => acc + pontos.reduce((s, p) => s + p[campo], 0),
				0,
			);
			expect(soma, `"${campo}" da série não fecha`).toBe(total.reduce((s, p) => s + p[campo], 0));
		}
	});

	it("fecha a COBERTURA e o QUEM CHEGOU por balde", async () => {
		const cobertura = await queries.computeCobertura(JANELA_DE, JANELA_ATE);
		expect(cobertura.conversasComOrigem).toBe(8);
		expect(cobertura.conversasTotal).toBe(8);

		const quemChegou = await queries.computeQuemChegou(JANELA_DE, JANELA_ATE);
		expect(quemChegou.total).toBe(8);

		let origemSomada = 0;
		let chegouSomado = 0;
		for (const braco of BALDES) {
			const c = await queries.computeCobertura(JANELA_DE, JANELA_ATE, recorteDe(braco));
			origemSomada += c.conversasComOrigem;
			const q = await queries.computeQuemChegou(JANELA_DE, JANELA_ATE, recorteDe(braco));
			chegouSomado += q.total;
		}

		expect(origemSomada).toBe(cobertura.conversasComOrigem);
		expect(chegouSomado).toBe(quemChegou.total);
	});

	it("marca o custo como não aplicável ao recorte, e não mexe nele sem recorte (D6)", async () => {
		const semRecorte = await queries.computeCustosDoCpc(JANELA_DE, JANELA_ATE);
		expect(semRecorte.custoNaoAplicavelAoRecorte).toBe(false);
		expect(semRecorte.contagens).toEqual({ conversas: 7, identificados: 4, qualificados: 3 });

		const comRecorte = await queries.computeCustosDoCpc(JANELA_DE, JANELA_ATE, recorteDe("A"));
		// O investimento da Meta é do PERÍODO INTEIRO: com recorte ativo ele sai
		// `null` (não zero) e a tela declara o motivo. Sem isso o CPC seria um
		// número dividido por um funil recortado — um CPC falso.
		expect(comRecorte.custoNaoAplicavelAoRecorte).toBe(true);
		expect(comRecorte.investimentoMetaCents).toBeNull();
		// As contagens seguem o recorte, para o bloco falar da mesma população do
		// funil logo acima.
		expect(comRecorte.contagens).toEqual({ conversas: 2, identificados: 2, qualificados: 2 });
	});

	it("fecha o HANDOFF por balde, pela conversa do lead (D10)", async () => {
		const total = await handoffQueries.computeFunilDeHandoff(JANELA_DE, JANELA_ATE);
		const qualificadoDe = (f: Awaited<ReturnType<typeof handoffQueries.computeFunilDeHandoff>>) =>
			f.etapas.find((e) => e.estagio === "qualificado")?.alcancaram ?? 0;

		expect(qualificadoDe(total)).toBe(3); // P1, P2 e a conversa que identificou P7

		const a = qualificadoDe(
			await handoffQueries.computeFunilDeHandoff(JANELA_DE, JANELA_ATE, undefined, recorteDe("A")),
		);
		const b = qualificadoDe(
			await handoffQueries.computeFunilDeHandoff(JANELA_DE, JANELA_ATE, undefined, recorteDe("B")),
		);
		const sem = qualificadoDe(
			await handoffQueries.computeFunilDeHandoff(
				JANELA_DE,
				JANELA_ATE,
				undefined,
				recorteDe(SEM_BRACO),
			),
		);

		expect(a).toBe(2); // o lead de P1 e o da conversa A de P7
		expect(b).toBe(1); // o lead de P2
		expect(sem).toBe(0);
		expect(a + b + sem).toBe(qualificadoDe(total));
	});
});
