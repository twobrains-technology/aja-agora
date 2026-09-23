// O PERCURSO de cada pessoa que chegou pela campanha (integration-db).
//
// Mesma disciplina do teste do funil de mídia: Postgres real e uma JANELA DE
// DATA ISOLADA (sorteada por execução), pra que o que já existe no banco do
// workspace — ou outra execução simultânea — não entre
// na conta e a asserção possa ser exata, não "maior que zero".
//
// O que este arquivo protege é o motivo da tela existir: quem clicou no anúncio
// e NÃO falou tem que aparecer. Um teste que só semeasse conversa passaria
// verde com a metade que já era visível antes.
//
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	CHIP_DE_BEM,
	PRIMEIRA_FALA_WHATSAPP,
	SEMENTE_VALOR_PREFIXO,
	TITULO_CATEGORIA_WHATSAPP,
} from "@/lib/funil/textos-do-cta";
import { semearCache, serializarChave } from "@/lib/meta-ads/resolver";
import type { PassoDoPercurso } from "./percurso-types";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// A JANELA É PRÓPRIA DE CADA EXECUÇÃO.
//
// Era fixa em maio/2019 — e a janela isola contra o que já existe no banco, mas
// não contra OUTRA execução deste mesmo arquivo. O Postgres é compartilhado
// entre os agentes que rodam a suíte, e duas execuções simultâneas semeavam na
// mesma janela: uma via as pessoas da outra e as contagens exatas (que são o
// valor deste teste) caíam. Aparecia como falha intermitente, do tipo que
// ninguém consegue reproduzir e todo mundo aprende a ignorar.
//
// Sorteando o mês dentro de uma faixa histórica ampla, cada execução ganha o seu
// pedaço de calendário. O `afterAll` continua limpando o que semeou.
const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const JANELA_DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const JANELA_ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);
const DEPOIS = new Date(`${ANO}-${MES}-16T12:00:00Z`);

// O id de campanha que o espelho local CONHECE. Sorteado por execução para não
// colidir com o que outra execução semeou no mesmo banco compartilhado.
const ID_CAMPANHA_RESOLVIDA = `12025095${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;
const NOME_DA_CAMPANHA = "META | EXP | LEAD | BR | PLACEMENTS";

describeIfDb("percurso — até onde cada pessoa foi (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let queries: typeof import("./percurso-queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];
	const contactIds: string[] = [];

	const UA_GENTE =
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
	const UA_ROBO = "ELB-HealthChecker/2.0";

	/**
	 * Até onde a pessoa semeada chegou. Espelha os degraus de `PASSOS_DO_PERCURSO`.
	 *
	 * `so_pre_preenchida` e `iniciou_conversa` são o par que o AJA-01 separou:
	 * o primeiro manda o texto que o CTA escreve, o segundo escreve algo próprio.
	 */
	type Ate =
		| "so_chegou"
		| "olhou_a_pagina"
		| "abriu_o_chat"
		| "so_pre_preenchida"
		| "iniciou_conversa"
		| "se_identificou"
		| "viu_oferta"
		| "proposta"
		| "fechado";

	interface Semente {
		/** Reaproveita o visitante — é assim que se semeia quem voltou. */
		visitorId?: string;
		utmSource?: string;
		utmCampaign?: string;
		/** `visits.campaign_id` — o id da Meta, a chave que resolve o nome real. */
		campaignId?: string;
		referrer?: string;
		userAgent?: string | null;
		landingPath?: string;
		quando?: Date;
		ate: Ate;
		simulada?: boolean;
		perdido?: boolean;
		nome?: string;
		telefone?: string;
		/**
		 * O texto da PRIMEIRA mensagem do cliente. Sem ele, o padrão é fala própria
		 * ("quero uma moto"); com `ate: "so_pre_preenchida"` o padrão vira o texto do
		 * CTA, que é o caso que o funil antes contava como engajamento.
		 */
		primeiraMensagem?: string;
		/** Canal da conversa semeada. O padrão é web. */
		canal?: "web" | "whatsapp";
	}

	async function semear(semente: Semente): Promise<string> {
		const quando = semente.quando ?? DENTRO;
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: semente.visitorId ?? `v-${crypto.randomUUID()}`,
				channel: semente.canal ?? "web",
				landingPath: semente.landingPath ?? "/motos",
				createdAt: quando,
				userAgent: semente.userAgent === undefined ? UA_GENTE : semente.userAgent,
				utmSource: semente.utmSource ?? null,
				utmCampaign: semente.utmCampaign ?? null,
				campaignId: semente.campaignId ?? null,
				referrer: semente.referrer ?? null,
			})
			.returning({ id: schema.visits.id });
		visitIds.push(visita.id);
		if (semente.ate === "so_chegou") return visita.id;

		// Prova de que a pessoa LEU a página: um clique gravado pelo mapa de calor.
		await db.insert(schema.pageEvents).values({
			visitId: visita.id,
			type: "click",
			path: semente.landingPath ?? "/motos",
			viewportWidth: 390,
			viewportHeight: 844,
			device: "mobile",
			createdAt: quando,
		});
		if (semente.ate === "olhou_a_pagina") return visita.id;

		const simulada = semente.simulada ?? false;
		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: semente.canal ?? "web",
				visitId: visita.id,
				isSimulated: simulada,
				createdAt: quando,
				updatedAt: quando,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);
		if (semente.ate === "abriu_o_chat") return visita.id;

		// O texto da primeira mensagem é o fato que o degrau lê: o CTA escreve
		// "Quero comprar um carro." (ou o chip de categoria) no lugar da pessoa.
		const textoDaPrimeira =
			semente.primeiraMensagem ??
			(semente.ate === "so_pre_preenchida" ? CHIP_DE_BEM.auto : "quero uma moto");
		const [mensagem] = await db
			.insert(schema.messages)
			.values({
				conversationId: conversa.id,
				role: "user",
				content: textoDaPrimeira,
				channel: semente.canal ?? "web",
				createdAt: quando,
			})
			.returning({ id: schema.messages.id });
		if (semente.ate === "so_pre_preenchida" || semente.ate === "iniciou_conversa") {
			return visita.id;
		}

		// Identificação vem ANTES da oferta: a Bevi exige CPF pra simular. A mesma
		// ordem do seed do funil de mídia — inverter produziria um funil crescente.
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conversa.id,
				name: semente.nome ?? "Cliente Teste",
				phone: semente.telefone ?? "+5511900000000",
				stage: semente.perdido
					? "perdido"
					: semente.ate === "fechado"
						? "fechado_ganho"
						: "qualificado",
				isSimulated: simulada,
				createdAt: quando,
				updatedAt: quando,
			})
			.returning({ id: schema.leads.id });
		if (semente.ate === "se_identificou") return visita.id;

		await db
			.insert(schema.artifacts)
			.values({ messageId: mensagem.id, type: "real_offer", payload: {}, createdAt: quando });
		if (semente.ate === "viu_oferta") return visita.id;

		await db.insert(schema.beviProposals).values({
			conversationId: conversa.id,
			leadId: lead.id,
			proposalId: `prop-${crypto.randomUUID()}`,
			createdAt: quando,
			updatedAt: quando,
		});
		return visita.id;
	}

	/**
	 * Pendura uma conversa SIMULADA — já fechada — numa visita real.
	 *
	 * O simulador do painel cria conversa `is_simulated` SEM visita
	 * (`api/admin/simulator/sessions/route.ts`), então em produção ela nunca
	 * apareceria aqui de qualquer forma. O que este cenário protege é o outro
	 * caminho: se um teste interno encostar numa chegada de verdade, ele não pode
	 * promover aquela pessoa a "Fechado" no relatório da campanha.
	 */
	async function pendurarSimuladaFechada(visitId: string): Promise<void> {
		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId,
				isSimulated: true,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		await db.insert(schema.messages).values({
			conversationId: conversa.id,
			role: "user",
			content: "teste interno",
			createdAt: DENTRO,
		});
		await db.insert(schema.leads).values({
			conversationId: conversa.id,
			name: "Teste Interno",
			phone: "+5511911111111",
			stage: "fechado_ganho",
			isSimulated: true,
			createdAt: DENTRO,
			updatedAt: DENTRO,
		});
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		queries = await import("./percurso-queries");
	});

	afterAll(async () => {
		// O cache do resolvedor é módulo-global: sem limpar, o nome semeado aqui
		// vazaria para o resto do arquivo e o caminho "não resolvido" mentiria.
		semearCache([]);
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

	describe("a escada inteira", () => {
		const VISITANTE_QUE_VOLTOU = `v-voltou-${crypto.randomUUID()}`;

		beforeAll(async () => {
			// O espelho local SINCRONIZADO, como se o ciclo da Meta já tivesse rodado:
			// só o id desta campanha é conhecido, e é isso que o teste isola.
			semearCache([
				[
					serializarChave({ tipo: "campaign_id", valor: ID_CAMPANHA_RESOLVIDA }),
					{
						nome: NOME_DA_CAMPANHA,
						entityId: ID_CAMPANHA_RESOLVIDA,
						origemDaResolucao: "id",
						status: "ACTIVE",
					},
				],
			]);
			// Uma pessoa por degrau — cada uma tem que cair no seu, e em nenhum outro.
			const soChegou = await semear({
				utmSource: "facebook",
				utmCampaign: "camp-a",
				ate: "so_chegou",
			});
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "olhou_a_pagina" });
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "abriu_o_chat" });
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "so_pre_preenchida" });
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "iniciou_conversa" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "se_identificou" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "viu_oferta" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "proposta" });
			// O degrau mais fundo carrega o `campaign_id` da Meta — é ele que resolve
			// o NOME da campanha no espelho local, em vez do sufixo de seis dígitos.
			await semear({
				utmSource: "google",
				utmCampaign: "camp-b",
				campaignId: ID_CAMPANHA_RESOLVIDA,
				ate: "fechado",
			});

			// Quem voltou: duas chegadas, uma pessoa. A segunda foi mais fundo.
			await semear({
				visitorId: VISITANTE_QUE_VOLTOU,
				utmSource: "facebook",
				utmCampaign: "camp-a",
				ate: "so_chegou",
				quando: DENTRO,
			});
			await semear({
				visitorId: VISITANTE_QUE_VOLTOU,
				utmSource: "facebook",
				utmCampaign: "camp-a",
				ate: "iniciou_conversa",
				quando: DEPOIS,
			});

			// Ruído que NÃO pode aparecer: o health check do ALB bate em `/` a cada
			// 30 segundos e já chegou a ser 82% das visitas do banco de produção.
			await semear({ userAgent: UA_ROBO, ate: "so_chegou" });
			// E o teste interno encostado numa chegada de verdade.
			await pendurarSimuladaFechada(soChegou);
		});

		it("põe cada pessoa no degrau em que ela parou", async () => {
			const { pessoas } = await queries.listarPercurso({ from: JANELA_DE, to: JANELA_ATE });
			const porPasso = new Map<PassoDoPercurso, number>();
			for (const p of pessoas) porPasso.set(p.passo, (porPasso.get(p.passo) ?? 0) + 1);

			// A pessoa que voltou soma em `iniciou_conversa` (o degrau mais fundo dela).
			expect(porPasso.get("so_chegou")).toBe(1);
			expect(porPasso.get("olhou_a_pagina")).toBe(1);
			expect(porPasso.get("abriu_o_chat")).toBe(1);
			expect(porPasso.get("so_pre_preenchida")).toBe(1);
			expect(porPasso.get("iniciou_conversa")).toBe(2);
			expect(porPasso.get("se_identificou")).toBe(1);
			expect(porPasso.get("viu_oferta")).toBe(1);
			expect(porPasso.get("proposta")).toBe(1);
			expect(porPasso.get("fechado")).toBe(1);
		});

		it("mostra quem chegou e não falou — o vão que a tela existe pra fechar", async () => {
			const { pessoas } = await queries.listarPercurso({ from: JANELA_DE, to: JANELA_ATE });
			const mudos = pessoas.filter((p) => p.conversas === 0);

			// Só chegou e olhou a página: duas pessoas sem uma linha sequer de conversa,
			// invisíveis em Conversas, em Pipeline e na ficha do contato.
			expect(mudos).toHaveLength(2);
			expect(mudos.every((p) => p.mensagensDoCliente === 0)).toBe(true);
			expect(mudos.map((p) => p.passo).sort()).toEqual(["olhou_a_pagina", "so_chegou"]);
		});

		it("junta as chegadas do mesmo visitante numa linha só", async () => {
			const { pessoas } = await queries.listarPercurso({ from: JANELA_DE, to: JANELA_ATE });
			const voltou = pessoas.filter((p) => p.visitorId === VISITANTE_QUE_VOLTOU);

			expect(voltou).toHaveLength(1);
			expect(voltou[0].chegadas).toBe(2);
			expect(voltou[0].passo).toBe("iniciou_conversa");
			// A primeira chegada é a que credita a campanha; a última é o sinal de vida.
			expect(new Date(voltou[0].primeiraChegada).toISOString()).toBe(DENTRO.toISOString());
			expect(new Date(voltou[0].ultimaAtividade).getTime()).toBeGreaterThanOrEqual(
				DEPOIS.getTime(),
			);
		});

		it("deixa robô e simulado de fora", async () => {
			const { pessoas, totalDePessoas } = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
			});

			// 9 degraus + 1 que voltou = 10. O health check do ALB não entra.
			expect(totalDePessoas).toBe(10);

			// E o teste interno pendurado na primeira chegada não a promoveu: ela
			// continua em "Só chegou", sem conversa e sem nome. Um `is_simulated`
			// vazando aqui viraria uma venda inexistente no relatório da campanha.
			const soChegou = pessoas.filter((p) => p.passo === "so_chegou");
			expect(soChegou).toHaveLength(1);
			expect(soChegou[0].conversas).toBe(0);
			expect(soChegou[0].nome).toBeNull();
			expect(pessoas.some((p) => p.nome === "Teste Interno")).toBe(false);
		});

		it("conta a escada do período inteiro, e as chegadas somam mais que as pessoas", async () => {
			const { resumo, totalDePessoas, totalDeChegadas } = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
			});
			const por = Object.fromEntries(resumo.map((r) => [r.chave, r.pessoas]));

			expect(por.so_chegou).toBe(1);
			expect(por.so_pre_preenchida).toBe(1);
			expect(por.iniciou_conversa).toBe(2);
			expect(por.fechado).toBe(1);
			expect(resumo.reduce((soma, r) => soma + r.pessoas, 0)).toBe(totalDePessoas);
			// 10 pessoas, 11 chegadas — uma delas veio duas vezes.
			expect(totalDeChegadas).toBe(11);
		});

		it("o degrau 'Se identificou' conta quem ALCANÇOU o fato — e fecha com o funil", async () => {
			// JANELA PRÓPRIA, fora da faixa que o resto do arquivo usa. Sem ela, as
			// sementes daqui entrariam nas contagens exatas dos outros testes (e as
			// deles aqui), e este caso ficaria verde por soma de terceiros — verde que
			// não prova nada.
			const ANO_ISOLADO = 2030 + Math.floor(Math.random() * 20);
			const MES_ISOLADO = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
			const DE_ISOLADO = new Date(`${ANO_ISOLADO}-${MES_ISOLADO}-01T00:00:00Z`);
			const ATE_ISOLADO = new Date(`${ANO_ISOLADO}-${MES_ISOLADO}-28T23:59:59Z`);
			const QUANDO_ISOLADO = new Date(`${ANO_ISOLADO}-${MES_ISOLADO}-15T12:00:00Z`);

			// (a) web COM visita que se identificou e SEGUIU até a oferta: parou em
			// "Viu oferta", mas alcançou "Se identificou". É ESTE o caso que fazia o
			// degrau mostrar menos gente do que de fato se identificou.
			await semear({
				visitorId: `v-${crypto.randomUUID()}`,
				ate: "viu_oferta",
				quando: QUANDO_ISOLADO,
				nome: "Seguiu Adiante",
			});

			// (b) web COM visita que se identificou e PAROU no degrau.
			const visitanteQueParou = `v-${crypto.randomUUID()}`;
			await semear({
				visitorId: visitanteQueParou,
				ate: "se_identificou",
				quando: QUANDO_ISOLADO,
				nome: "Parou Aqui",
			});

			// (c) a MESMA pessoa com uma SEGUNDA conversa: uma pessoa, duas
			// conversas — é a diferença que a tela precisa explicar, e não um erro.
			await semear({
				visitorId: visitanteQueParou,
				ate: "se_identificou",
				quando: QUANDO_ISOLADO,
				nome: "Parou Aqui",
			});

			// (d) web COM visita que NÃO se identificou (nunca deixou contato): fica
			// em "Iniciou a conversa" e não pode aparecer no degrau.
			await semear({
				visitorId: `v-${crypto.randomUUID()}`,
				ate: "iniciou_conversa",
				quando: QUANDO_ISOLADO,
			});

			// (e) conversa de WhatsApp SEM visita — o caso que o `JOIN visita`
			// descarta. O recorte tem de ser IGUAL dos dois lados: quem não chegou
			// não entra nem aqui nem lá, senão a divergência volta pela borda.
			const [conversaSemVisita] = await db
				.insert(schema.conversations)
				.values({
					channel: "whatsapp",
					waId: `55119${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
					isSimulated: false,
					createdAt: QUANDO_ISOLADO,
					updatedAt: QUANDO_ISOLADO,
				})
				.returning({ id: schema.conversations.id });
			convIds.push(conversaSemVisita.id);
			await db.insert(schema.messages).values({
				conversationId: conversaSemVisita.id,
				role: "user",
				content: "oi",
				channel: "whatsapp",
				createdAt: QUANDO_ISOLADO,
			});

			const { resumo, totalDeConversas } = await queries.listarPercurso({
				from: DE_ISOLADO,
				to: ATE_ISOLADO,
			});
			const por = Object.fromEntries(resumo.map((r) => [r.chave, r]));

			// O FATO: duas pessoas se identificaram (a que seguiu e a que parou). A
			// leitura antiga, que só via a posição, responderia 1.
			expect(por.se_identificou?.alcancaram).toBe(2);
			expect(por.se_identificou?.pessoas).toBe(1);

			// As conversas abertas por essas pessoas: 1 da que seguiu + 2 da que parou
			// + 1 da que só iniciou conversa = 4. É o número que fecha com a etapa
			// "Conversas" do funil — e NÃO com a de identificados, porque ele soma
			// todas as conversas das pessoas, identificadas ou não.
			expect(totalDeConversas).toBe(4);

			// E o funil de mídia, lido na MESMA janela, conta a mesma gente: 4
			// conversas no total, 3 delas identificadas, para 2 PESSOAS. A diferença
			// entre conversa e pessoa é exatamente quem abriu duas.
			const { computeFunilMidia } = await import("./performance-queries");
			const funil = await computeFunilMidia(DE_ISOLADO, ATE_ISOLADO);
			expect(funil.find((e) => e.chave === "conversas")?.count).toBe(totalDeConversas);
			const etapa = funil.find((e) => e.chave === "identificados");
			expect(etapa?.count).toBe(3);
			expect(por.se_identificou?.alcancaram).toBeLessThanOrEqual(etapa?.count ?? 0);
		});

		it("carrega o nome, a origem e a conversa de quem se identificou", async () => {
			const { pessoas } = await queries.listarPercurso({ from: JANELA_DE, to: JANELA_ATE });
			const fechado = pessoas.find((p) => p.passo === "fechado");

			expect(fechado?.nome).toBe("Cliente Teste");
			expect(fechado?.telefone).toBe("+5511900000000");
			expect(fechado?.origemTipo).toBe("campanha");
			expect(fechado?.origemLabel).toContain("google");
			expect(fechado?.campanha).toBe("camp-b");
			expect(fechado?.landingPath).toBe("/motos");
			expect(fechado?.stageDoLead).toBe("fechado_ganho");
			// Sem o id da conversa a linha não abre o que a pessoa falou — que é
			// metade do pedido.
			expect(fechado?.conversationId).toBeTruthy();
		});

		it("leva o campaign_id da visita até o nome real da campanha", async () => {
			// O que este teste guarda é a LIGAÇÃO: a coluna tem que atravessar o CTE
			// (`visita` → `credito` → `final`) até `origemDaVisita`. Se qualquer um
			// desses passos largar o campo, a tela volta ao sufixo de seis dígitos —
			// que casa com duas campanhas — e nenhum teste unitário percebe, porque
			// o bug estaria no SQL.
			const { pessoas } = await queries.listarPercurso({ from: JANELA_DE, to: JANELA_ATE });
			const fechado = pessoas.find((p) => p.passo === "fechado");

			expect(fechado?.nomeDaCampanha).toBe(NOME_DA_CAMPANHA);
			expect(fechado?.entityId).toBe(ID_CAMPANHA_RESOLVIDA);
		});

		it("sem resolução, a linha cai no rótulo de antes em vez de sumir", async () => {
			// O espelho local pode ainda não ter sincronizado. Não saber não é erro:
			// apagar o que já aparecia seria pior que o problema original.
			const { pessoas } = await queries.listarPercurso({ from: JANELA_DE, to: JANELA_ATE });
			const soChegou = pessoas.find((p) => p.passo === "so_chegou");

			expect(soChegou?.campanha).toBe("camp-a");
			expect(soChegou?.nomeDaCampanha ?? null).toBeNull();
			expect(soChegou?.entityId ?? null).toBeNull();
		});

		it("filtra por degrau, em 'parou aqui' e em 'chegou ao menos aqui'", async () => {
			const parou = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				passo: "iniciou_conversa",
				modo: "parou",
			});
			expect(parou.total).toBe(2);
			expect(parou.pessoas.every((p) => p.passo === "iniciou_conversa")).toBe(true);

			const alcancou = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				passo: "iniciou_conversa",
				modo: "alcancou",
			});
			// Quem iniciou a conversa ou passou disso: 2 + identificou + oferta +
			// proposta + fechado. Quem só mandou a mensagem do anúncio NÃO entra: é
			// exatamente a diferença que o degrau passou a fazer.
			expect(alcancou.total).toBe(6);

			// O resumo NÃO acompanha o filtro — é o denominador da leitura.
			expect(parou.resumo.reduce((soma, r) => soma + r.pessoas, 0)).toBe(10);
		});

		it("filtra por origem com a mesma precedência da tabela por origem", async () => {
			const { pessoas, total } = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				origem: "campanha:google",
			});

			expect(total).toBe(4);
			expect(pessoas.every((p) => p.origemLabel.includes("google"))).toBe(true);
		});

		it("pagina sem perder o total", async () => {
			const primeira = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				limit: 3,
				offset: 0,
			});
			const segunda = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				limit: 3,
				offset: 3,
			});

			expect(primeira.pessoas).toHaveLength(3);
			expect(primeira.total).toBe(10);
			expect(segunda.total).toBe(10);
			const repetidas = primeira.pessoas.filter((p) =>
				segunda.pessoas.some((q) => q.chave === p.chave),
			);
			expect(repetidas).toHaveLength(0);
		});
	});

	// ── AJA-01: O QUE CONTA COMO "INICIOU A CONVERSA" ──────────────────────
	//
	// O funil dizia "Engajaram 99%" enquanto 47% das conversas web tinham uma
	// única mensagem, e ela era o texto do anúncio. Estes quatro casos são a
	// regra inteira: o texto do CTA sozinho NÃO inicia a conversa; a segunda
	// mensagem — digitada — inicia; e vale igual no WhatsApp, onde a fala do
	// `wa.me` chega já escrita.
	describe("a mensagem pré-preenchida do anúncio", () => {
		async function conversaDaVisita(visitId: string): Promise<string> {
			const conversa = await db.query.conversations.findFirst({
				where: (c, { eq: igual }) => igual(c.visitId, visitId),
				columns: { id: true },
			});
			if (!conversa) throw new Error("visita semeada sem conversa");
			return conversa.id;
		}

		async function pessoaDaVisita(visitId: string) {
			// A linha do percurso é indexada pelo VISITANTE (a visita é a chegada, o
			// visitante é a pessoa) — por isso o id da visita é traduzido aqui.
			const visita = await db.query.visits.findFirst({
				where: (v, { eq: igual }) => igual(v.id, visitId),
				columns: { visitorId: true },
			});
			const { pessoas } = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				limit: 200,
			});
			return pessoas.find((p) => p.visitorId === visita?.visitorId);
		}

		it("conversa só com o texto do chip NÃO inicia a conversa", async () => {
			const visitId = await semear({
				utmSource: "facebook",
				utmCampaign: "camp-cta",
				ate: "so_pre_preenchida",
			});

			const pessoa = await pessoaDaVisita(visitId);
			expect(pessoa?.passo).toBe("so_pre_preenchida");
			// A mensagem existe (o cliente apertou enviar) — o que não existe é
			// conversa dele. É esta distinção que o degrau nomeia.
			expect(pessoa?.mensagensDoCliente).toBe(1);
		});

		it("a segunda mensagem, digitada, inicia a conversa", async () => {
			const visitId = await semear({
				utmSource: "facebook",
				utmCampaign: "camp-cta",
				ate: "so_pre_preenchida",
			});
			await db.insert(schema.messages).values({
				conversationId: await conversaDaVisita(visitId),
				role: "user",
				content: "quero um carro de 80 mil no maximo",
				channel: "web",
				createdAt: DEPOIS,
			});

			const pessoa = await pessoaDaVisita(visitId);
			expect(pessoa?.passo).toBe("iniciou_conversa");
			expect(pessoa?.mensagensDoCliente).toBe(2);
		});

		it("no WhatsApp, 'Oi! Quero comparar consórcios.' sozinho também não conta", async () => {
			const visitId = await semear({
				utmSource: "facebook",
				utmCampaign: "camp-cta-wa",
				canal: "whatsapp",
				ate: "so_pre_preenchida",
				primeiraMensagem: PRIMEIRA_FALA_WHATSAPP,
			});

			const pessoa = await pessoaDaVisita(visitId);
			expect(pessoa?.passo).toBe("so_pre_preenchida");
			expect(pessoa?.canal).toBe("whatsapp");
		});

		it("a semente dinâmica do catálogo (com valor) também é texto do produto", async () => {
			const visitId = await semear({
				utmSource: "facebook",
				utmCampaign: "camp-cta-valor",
				ate: "so_pre_preenchida",
				primeiraMensagem: `${SEMENTE_VALOR_PREFIXO.auto}R$ 50.000.`,
			});

			const pessoa = await pessoaDaVisita(visitId);
			expect(pessoa?.passo).toBe("so_pre_preenchida");
		});

		it("o chip de categoria do chat web ('Automóvel') também é texto do produto", async () => {
			const visitId = await semear({
				utmSource: "facebook",
				utmCampaign: "camp-cta-chip",
				ate: "so_pre_preenchida",
				primeiraMensagem: "Automóvel",
			});

			const pessoa = await pessoaDaVisita(visitId);
			expect(pessoa?.passo).toBe("so_pre_preenchida");
		});

		it("o painel de categoria do WhatsApp ('Carro') também é texto do produto", async () => {
			const visitId = await semear({
				utmSource: "facebook",
				utmCampaign: "camp-cta-botao",
				canal: "whatsapp",
				ate: "so_pre_preenchida",
				primeiraMensagem: TITULO_CATEGORIA_WHATSAPP.auto,
			});

			const pessoa = await pessoaDaVisita(visitId);
			expect(pessoa?.passo).toBe("so_pre_preenchida");
		});
	});

	describe("identidade", () => {
		beforeAll(async () => {
			// O contato unificado é a identidade resolvida da pessoa; o `leads.name`
			// é o que o agente captou naquela conversa, e as duas coisas divergem
			// quando o mesmo cliente conversa várias vezes.
			const [contato] = await db
				.insert(schema.contacts)
				.values({ name: "Nome do Contato", phone: "+5562988887777" })
				.returning({ id: schema.contacts.id });
			contactIds.push(contato.id);

			const visitId = await semear({
				utmSource: "linkedin",
				utmCampaign: "camp-d",
				ate: "se_identificou",
				nome: "Nome do Lead",
				telefone: "+5511555554444",
			});

			await db
				.update(schema.conversations)
				.set({ contactId: contato.id })
				.where(eq(schema.conversations.visitId, visitId));
		});

		it("mostra o nome do CONTATO, o mesmo que a ficha abre", async () => {
			const { pessoas } = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				origem: "campanha:linkedin",
			});

			expect(pessoas).toHaveLength(1);
			// A lista dizia "Beatriz" e a ficha abria "Kairo" — visto na tela em
			// 18/08/2026. Duas identidades para a mesma linha fazem o operador
			// desconfiar do painel inteiro, e com razão.
			expect(pessoas[0].nome).toBe("Nome do Contato");
			expect(pessoas[0].telefone).toBe("+5562988887777");
			expect(pessoas[0].contactId).toBe(contactIds[contactIds.length - 1]);
		});
	});

	describe("lead perdido", () => {
		beforeAll(async () => {
			await semear({
				utmSource: "tiktok",
				utmCampaign: "camp-c",
				ate: "viu_oferta",
				perdido: true,
				nome: "Desistiu",
			});
		});

		it("marca o perdido como selo, sem rebaixar o degrau que ele alcançou", async () => {
			const { pessoas } = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				origem: "campanha:tiktok",
			});

			expect(pessoas).toHaveLength(1);
			// Ele VIU a oferta — perder depois não apaga o caminho percorrido, e é
			// esse caminho que diz se o anúncio e a landing fizeram o trabalho.
			expect(pessoas[0].passo).toBe("viu_oferta");
			expect(pessoas[0].perdido).toBe(true);
			expect(pessoas[0].stageDoLead).toBe("perdido");
		});
	});
	// ── O QUE CONTA COMO SINAL, degrau a degrau ─────────────────────────────
	//
	// Os dois primeiros degraus são derivados de `page_events`, e é aí que a
	// escada estava afirmando comportamento que o dado não sustenta:
	//
	// - "Olhou a página" bastava QUALQUER evento da visita — e `section_view`
	//   dispara sozinho, no primeiro quadro, porque o hero e a barra fixa já
	//   estão a mais de 50% na tela sem ninguém rolar nada. Medido em produção
	//   em 24/08/2026: 536 visitas com `section_view` contra 96 com rolagem ou
	//   clique de verdade — 82% do degrau era gente que só carregou a página.
	// - "Abriu o chat" era derivado de conversa SEM mensagem do cliente, e a
	//   conversa só nasce no primeiro `POST /api/chat`, ou seja, depois de a
	//   pessoa escrever. O degrau é estruturalmente vazio, e quem abriu o teatro
	//   e desistiu diante do palco vazio — que é exatamente quem ele deveria
	//   mostrar — caía um degrau abaixo. O fato existe desde 18/08 em
	//   `page_events.chat_open` (30 eventos em 30 dias na produção) e nenhuma
	//   consulta o lia.
	describe("o que conta como sinal", () => {
		const SO_SECAO = `v-so-secao-${crypto.randomUUID()}`;
		const ABRIU_O_TEATRO = `v-abriu-teatro-${crypto.randomUUID()}`;

		/** Uma visita crua, sem nenhum evento pendurado. */
		async function visitaNua(visitorId: string): Promise<string> {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId,
					channel: "web",
					landingPath: "/motos",
					createdAt: DENTRO,
					userAgent: UA_GENTE,
					utmSource: "instagram",
					utmCampaign: "camp-sinal",
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);
			return visita.id;
		}

		async function evento(
			visitId: string,
			type: "section_view" | "chat_open",
			section: string,
		): Promise<void> {
			await db.insert(schema.pageEvents).values({
				visitId,
				type,
				path: "/motos",
				section,
				viewportWidth: 390,
				viewportHeight: 844,
				device: "mobile",
				createdAt: DENTRO,
			});
		}

		beforeAll(async () => {
			await evento(await visitaNua(SO_SECAO), "section_view", "kv-hero");
			await evento(await visitaNua(ABRIU_O_TEATRO), "chat_open", "kv-hero");
		});

		async function pessoaDe(visitorId: string) {
			const { pessoas } = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				limit: 200,
			});
			return pessoas.find((p) => p.visitorId === visitorId);
		}

		it("não chama de leitura a seção que apareceu sozinha na tela", async () => {
			const pessoa = await pessoaDe(SO_SECAO);
			expect(pessoa?.passo).toBe("so_chegou");
		});

		it("mostra no degrau do chat quem abriu o teatro e desistiu antes de escrever", async () => {
			const pessoa = await pessoaDe(ABRIU_O_TEATRO);
			expect(pessoa?.conversas).toBe(0);
			expect(pessoa?.passo).toBe("abriu_o_chat");
		});
	});
});
