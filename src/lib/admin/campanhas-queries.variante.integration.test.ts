// O recorte por BRAÇO de experimento na tela de Campanhas (FIX-404) — contra
// Postgres real.
//
// O que só se prova aqui, e é o coração do bloco:
//
//   1. **O fechamento por campanha.** Cada degrau do funil da linha da campanha
//      tem que fechar: `braço A + braço B + sem variante = todas`. É o mesmo
//      invariante das outras telas, medido no mesmo fragmento (`contagensDoFunil`);
//      se a campanha tivesse um caminho de contagem próprio, ele divergiria.
//   2. **A âncora na identificação.** A pessoa é atribuída ao braço da conversa
//      em que ELA SE IDENTIFICOU; sem nenhuma, à última exposição. A campanha é
//      só o recorte de agrupamento — a regra é a mesma da Performance.
//   3. **O custo da Meta não se divide por braço** (D6): com recorte ativo o
//      gasto/CPC/CPL saem `null` e a resposta carrega
//      `custoNaoAplicavelAoRecorte: true`. Sem recorte, os números são os de
//      sempre — a tela não pode mudar por causa de um filtro que ninguém ligou.
//
// Skip se DATABASE_URL ausente. O banco é COMPARTILHADO: toda asserção é feita
// sobre as linhas que este arquivo semeia, numa janela isolada.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/variante-da-visita";
import { EXPERIMENTOS, type RecorteAB, SEM_BRACO } from "@/lib/experimentos/registro";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Janela isolada (2017-03) — nenhum outro teste do repo a usa, então o que já
// existe no banco não entra na conta.
const DE = new Date("2017-03-01T00:00:00Z");
const ATE = new Date("2017-03-31T23:59:59Z");

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/** A campanha das sementes — o `campaign_id` da Meta é a chave mais forte. */
const CAMPANHA = "120250777777770104";
const CAMPANHA_GASTOU_SEM_FUNIL = "120250777777770105";
const CRIATIVO = "ad-recorte";

const EXPERIMENTO = EXPERIMENTOS[0].id;

/** O recorte de UM braço do experimento real, como o painel o monta. */
function recorte(braco: string): RecorteAB {
	return [{ experimento: EXPERIMENTO, braco }];
}

type Resposta = Awaited<ReturnType<typeof import("./campanhas-queries").computeCampanhas>>;
type Linha = Resposta["linhas"][number];

describeIfDb("campanhas — recorte por braço de experimento (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let computeCampanhas: typeof import("./campanhas-queries").computeCampanhas;

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const leadIds: string[] = [];
	const metaEntityIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ computeCampanhas } = await import("./campanhas-queries"));
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db
				.delete(schema.beviProposals)
				.where(inArray(schema.beviProposals.conversationId, convIds));
			await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (leadIds.length > 0) {
			await db.delete(schema.leads).where(inArray(schema.leads.id, leadIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
		if (metaEntityIds.length > 0) {
			await db
				.delete(schema.metaEntities)
				.where(inArray(schema.metaEntities.entityId, metaEntityIds));
			await db
				.delete(schema.metaInsightsDiarios)
				.where(inArray(schema.metaInsightsDiarios.entityId, metaEntityIds));
		}
	});

	/**
	 * Semeia uma chegada: a visita e, quando pedido, a conversa daquela visita.
	 *
	 * `variante` vai no metadata exatamente como o produto grava (a chave vem do
	 * módulo do teste do telefone, nunca redigitada). `conversaEm` permite criar a
	 * conversa FORA do período com a visita DENTRO — o caso "o braço só existe
	 * fora do período".
	 */
	async function semear(opts: {
		visitorId: string;
		em: Date;
		campanha?: string | null;
		comConversa: boolean;
		variante?: string | null;
		conversaEm?: Date;
		/** Marca a conversa como identificada e QUALIFICADA (lead com telefone). */
		identificado?: boolean;
	}): Promise<void> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: opts.visitorId,
				channel: "web",
				createdAt: opts.em,
				userAgent: UA_GENTE,
				utmSource: "ig",
				utmContent: CRIATIVO,
				campaignId: opts.campanha === undefined ? CAMPANHA : opts.campanha,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);
		if (!opts.comConversa) return;

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId: visita.id,
				createdAt: opts.conversaEm ?? opts.em,
				updatedAt: opts.conversaEm ?? opts.em,
				metadata:
					opts.variante === undefined || opts.variante === null
						? null
						: { [CHAVE_DO_TESTE_NO_METADATA]: { variante: opts.variante } },
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		if (opts.identificado) {
			const [lead] = await db
				.insert(schema.leads)
				.values({
					conversationId: conversa.id,
					name: "Cliente Teste",
					phone: "+5511900000000",
					stage: "qualificado",
					createdAt: opts.em,
					updatedAt: opts.em,
				})
				.returning({ id: schema.leads.id });
			leadIds.push(lead.id);
		}
	}

	beforeAll(async () => {
		// ── X: identificou no braço A e abriu uma conversa B DEPOIS ──────────
		// A âncora vence a exposição mais recente: X é do braço A.
		await semear({
			visitorId: "pessoa-x",
			em: new Date("2017-03-15T10:00:00Z"),
			comConversa: true,
			variante: "A",
			identificado: true,
		});
		await semear({
			visitorId: "pessoa-x",
			em: new Date("2017-03-15T11:00:00Z"),
			comConversa: true,
			variante: "B",
		});

		// ── Y: nunca se identificou, braço A em t1 e B em t2 ────────────────
		// Exposição pura: vale a ÚLTIMA, então Y é do braço B.
		await semear({
			visitorId: "pessoa-y",
			em: new Date("2017-03-15T09:00:00Z"),
			comConversa: true,
			variante: "A",
		});
		await semear({
			visitorId: "pessoa-y",
			em: new Date("2017-03-15T12:00:00Z"),
			comConversa: true,
			variante: "B",
		});

		// ── Z: metadata com valor fora da allowlist ─────────────────────────
		// Não pode quebrar a partição: cai em "sem variante".
		await semear({
			visitorId: "pessoa-z",
			em: new Date("2017-03-15T13:00:00Z"),
			comConversa: true,
			variante: "C",
		});

		// ── W: o braço existe, mas só FORA do período ───────────────────────
		// O período manda: sem variante.
		await semear({
			visitorId: "pessoa-w",
			em: new Date("2017-03-15T14:00:00Z"),
			comConversa: true,
			variante: "A",
			conversaEm: new Date("2017-02-01T14:00:00Z"),
		});

		// ── V: só chegou, nunca abriu conversa ─────────────────────────────
		await semear({
			visitorId: "pessoa-v",
			em: new Date("2017-03-15T15:00:00Z"),
			comConversa: false,
		});

		// ── O espelho da Meta: a campanha das sementes, o anúncio do criativo
		// e uma campanha que gastou sem ninguém do CRM apontar para ela ────
		await db.insert(schema.metaEntities).values([
			{ entityId: CAMPANHA, nivel: "campaign", nome: "META | RECORTE A/B", status: "ACTIVE" },
			{
				entityId: CAMPANHA_GASTOU_SEM_FUNIL,
				nivel: "campaign",
				nome: "TOFU | SEM CRM",
				status: "ACTIVE",
			},
			{
				entityId: CRIATIVO,
				nivel: "ad",
				nome: "ANUNCIO | RECORTE",
				creativeName: "IMG | RECORTE | V1",
			},
		]);
		metaEntityIds.push(CAMPANHA, CAMPANHA_GASTOU_SEM_FUNIL, CRIATIVO);

		await db.insert(schema.metaInsightsDiarios).values([
			{
				data: "2017-03-15",
				entityId: CAMPANHA,
				nivel: "campaign",
				spendCents: 120_000,
				leads: 9,
				impressions: 1000,
				clicks: 50,
			},
			{
				data: "2017-03-15",
				entityId: CAMPANHA_GASTOU_SEM_FUNIL,
				nivel: "campaign",
				spendCents: 80_000,
				leads: 4,
				impressions: 800,
				clicks: 40,
			},
		]);
	});

	/** A linha da campanha semeada, achada pela chave. */
	function linhaDe(resposta: Resposta, chave: string = CAMPANHA): Linha {
		const linha = resposta.linhas.find((l) => l.chave === chave);
		expect(linha, `linha da campanha ${chave}`).toBeDefined();
		return linha as Linha;
	}

	const COLUNAS_DO_FUNIL = [
		"visitas",
		"conversas",
		"identificados",
		"comTelefone",
		"qualificados",
		"propostas",
		"fechados",
	] as const;

	it("sem recorte, a resposta é idêntica à de hoje e a flag é false", async () => {
		const semParametro = await computeCampanhas(DE, ATE);
		const comVazio = await computeCampanhas(DE, ATE, []);

		// C4: o default não move um número sequer — nem o objeto.
		expect(comVazio).toEqual(semParametro);
		expect(semParametro.custoNaoAplicavelAoRecorte).toBe(false);

		// 120000 centavos ÷ 1 qualificado.
		const daCampanha = linhaDe(semParametro);
		expect(daCampanha.spendCents).toBe(120_000);
		expect(daCampanha.custoPorQualificado).toEqual({ tipo: "valor", centavos: 120_000 });
	});

	it("cada degrau do funil da campanha fecha: A + B + sem variante = todas", async () => {
		const todas = await computeCampanhas(DE, ATE);
		const doA = await computeCampanhas(DE, ATE, recorte("A"));
		const doB = await computeCampanhas(DE, ATE, recorte("B"));
		const sem = await computeCampanhas(DE, ATE, recorte(SEM_BRACO));

		const linhaTodas = linhaDe(todas);

		// Os números das sementes, explícitos: 7 chegadas, 4 pessoas com conversa,
		// 1 identificada (X), 1 com contato no lead (X) e 1 qualificada (X).
		expect(linhaTodas.visitas).toBe(7);
		expect(linhaTodas.conversas).toBe(4);
		expect(linhaTodas.identificados).toBe(1);
		expect(linhaTodas.comTelefone).toBe(1);
		expect(linhaTodas.qualificados).toBe(1);
		expect(linhaTodas.propostas).toBe(0);
		expect(linhaTodas.fechados).toBe(0);

		// X (identificou em A, abriu B depois) fica no braço A; Y (nunca
		// identificou) fica na última exposição, B; Z ("C"), W (braço só fora do
		// período) e V (só chegou) ficam sem variante.
		expect(linhaDe(doA).visitas).toBe(2);
		expect(linhaDe(doA).conversas).toBe(1);
		expect(linhaDe(doA).identificados).toBe(1);
		expect(linhaDe(doA).comTelefone).toBe(1);
		expect(linhaDe(doA).qualificados).toBe(1);

		expect(linhaDe(doB).visitas).toBe(2);
		expect(linhaDe(doB).conversas).toBe(1);
		expect(linhaDe(doB).identificados).toBe(0);
		expect(linhaDe(doB).qualificados).toBe(0);

		expect(linhaDe(sem).visitas).toBe(3);
		expect(linhaDe(sem).conversas).toBe(2);
		expect(linhaDe(sem).identificados).toBe(0);
		expect(linhaDe(sem).qualificados).toBe(0);

		for (const coluna of COLUNAS_DO_FUNIL) {
			expect(
				linhaDe(doA)[coluna] + linhaDe(doB)[coluna] + linhaDe(sem)[coluna],
				`fechamento da coluna ${coluna}`,
			).toBe(linhaTodas[coluna]);
		}
	});

	it("o criativo sai do mesmo fragmento e fecha igual à linha da campanha", async () => {
		const todas = await computeCampanhas(DE, ATE);
		const doA = await computeCampanhas(DE, ATE, recorte("A"));
		const doB = await computeCampanhas(DE, ATE, recorte("B"));
		const sem = await computeCampanhas(DE, ATE, recorte(SEM_BRACO));

		const criativoDe = (resposta: Resposta) =>
			linhaDe(resposta).criativos.find((c) => c.chave === CRIATIVO);

		expect(criativoDe(todas)).toBeDefined();
		expect(criativoDe(todas)?.visitas).toBe(7);
		expect(criativoDe(doA)?.visitas).toBe(2);
		expect(criativoDe(doB)?.visitas).toBe(2);
		expect(criativoDe(sem)?.visitas).toBe(3);
		expect(
			(criativoDe(doA)?.visitas ?? 0) +
				(criativoDe(doB)?.visitas ?? 0) +
				(criativoDe(sem)?.visitas ?? 0),
		).toBe(criativoDe(todas)?.visitas);
	});

	it("com recorte ativo o custo da Meta sai null e a flag diz o motivo", async () => {
		const doA = await computeCampanhas(DE, ATE, recorte("A"));

		expect(doA.custoNaoAplicavelAoRecorte).toBe(true);

		const daCampanha = linhaDe(doA);
		expect(daCampanha.spendCents).toBeNull();
		expect(daCampanha.custoPorQualificado).toBeNull();

		// O investimento é do PERÍODO INTEIRO (`meta_insights_diarios` não tem
		// coluna de braço): rateá-lo pelo funil recortado inventaria um CPC por onde
		// a verba passa. Os totais saem null.
		expect(doA.totais.investimentoCents).toBeNull();
		expect(doA.totais.investimentoAtribuidoCents).toBeNull();
		expect(doA.totais.investimentoSemAtribuicaoCents).toBeNull();
		expect(doA.totais.custoPorQualificado).toBeNull();

		// O funil continua visível: é ele que a tela mostra no recorte.
		expect(daCampanha.visitas).toBe(2);
		expect(daCampanha.conversas).toBe(1);
		expect(daCampanha.identificados).toBe(1);

		// A campanha que só gastou continua na lista (não some com o recorte), mas
		// também sem custo aplicável.
		const queimou = linhaDe(doA, CAMPANHA_GASTOU_SEM_FUNIL);
		expect(queimou.spendCents).toBeNull();
		expect(queimou.custoPorQualificado).toBeNull();
	});

	it("sem recorte, o custo continua o de hoje (a flag não muda número)", async () => {
		const todas = await computeCampanhas(DE, ATE);

		expect(todas.custoNaoAplicavelAoRecorte).toBe(false);
		expect(linhaDe(todas).spendCents).toBe(120_000);
		expect(todas.totais.investimentoCents).toBe(200_000);
		// 200000 centavos ÷ 1 qualificado no total.
		expect(todas.totais.custoPorQualificado).toEqual({ tipo: "valor", centavos: 200_000 });

		const queimou = linhaDe(todas, CAMPANHA_GASTOU_SEM_FUNIL);
		expect(queimou.spendCents).toBe(80_000);
		expect(queimou.custoPorQualificado).toEqual({ tipo: "motivo", motivo: "sem_vinculo" });
	});
});
