// D1 + D3/E1 (integration-db) — o funil por sub-etapa e a campainha do SLA.
//
// Contra Postgres real porque a consulta inteira é SQL: janela `LEAD()`,
// `percentile_cont`, `DISTINCT` sobre idas e vindas do funil e o `unnest` que
// garante etapa com zero aparecendo na tela em vez de sumir. Nada disso se
// prova com repositório fingido — e etapa que SOME é pior do que etapa zerada,
// porque o leitor conclui que o passo não existe.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("D1 — funil por sub-etapa do handoff (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let computeFunilDeHandoff: typeof import("./handoff-queries").computeFunilDeHandoff;
	let SUB_ETAPAS_HANDOFF: typeof import("./handoff-queries").SUB_ETAPAS_HANDOFF;

	const convIds: string[] = [];
	const leadIds: string[] = [];

	const DE = new Date("2026-08-01T00:00:00Z");
	const ATE = new Date("2026-08-31T23:59:59Z");

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ computeFunilDeHandoff, SUB_ETAPAS_HANDOFF } = await import("./handoff-queries"));
	});

	afterAll(async () => {
		if (leadIds.length > 0) {
			await db.delete(schema.leadEvents).where(inArray(schema.leadEvents.leadId, leadIds));
			await db.delete(schema.leads).where(inArray(schema.leads.id, leadIds));
		}
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	/** Um lead com a trilha de estágios que ele percorreu, e quando. */
	async function leadComTrilha(
		trilha: Array<{ de: string | null; para: string; em: Date }>,
		opts: { nome?: string; simulado?: boolean; nascidoEm?: Date } = {},
	) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web", isSimulated: opts.simulado ?? false })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		const ultimo = trilha[trilha.length - 1];
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				name: opts.nome ?? "Teste D1",
				phone: "11999990000",
				isSimulated: opts.simulado ?? false,
				stage: ultimo.para as never,
				createdAt: opts.nascidoEm ?? new Date("2026-08-10T12:00:00Z"),
				updatedAt: ultimo.em,
			})
			.returning({ id: schema.leads.id });
		leadIds.push(lead.id);

		for (const passo of trilha) {
			await db.insert(schema.leadEvents).values({
				leadId: lead.id,
				fromStage: passo.de as never,
				toStage: passo.para as never,
				actorType: "system",
				createdAt: passo.em,
			});
		}
		return lead.id;
	}

	it("toda sub-etapa aparece, inclusive as que ninguém alcançou", async () => {
		// Etapa que SOME é pior do que etapa zerada: o leitor conclui que o passo
		// não existe na operação, quando na verdade ninguém chegou lá.
		const funil = await computeFunilDeHandoff(DE, ATE);
		expect(funil.etapas.map((e) => e.estagio)).toEqual(SUB_ETAPAS_HANDOFF.map((e) => e.estagio));
	});

	it("conta quem ALCANÇOU cada estágio e a taxa entre eles", async () => {
		await leadComTrilha([
			{ de: "novo", para: "qualificado", em: new Date("2026-08-10T12:00:00Z") },
			{ de: "qualificado", para: "em_negociacao", em: new Date("2026-08-10T16:00:00Z") },
			{ de: "em_negociacao", para: "proposta_enviada", em: new Date("2026-08-11T12:00:00Z") },
		]);
		await leadComTrilha([
			{ de: "novo", para: "qualificado", em: new Date("2026-08-12T09:00:00Z") },
			{ de: "qualificado", para: "em_negociacao", em: new Date("2026-08-12T11:00:00Z") },
		]);

		const funil = await computeFunilDeHandoff(DE, ATE);
		const porEstagio = new Map(funil.etapas.map((e) => [e.estagio, e]));

		expect(porEstagio.get("qualificado")?.alcancaram).toBeGreaterThanOrEqual(2);
		expect(porEstagio.get("em_negociacao")?.alcancaram).toBeGreaterThanOrEqual(2);
		expect(porEstagio.get("proposta_enviada")?.alcancaram).toBeGreaterThanOrEqual(1);
		// O topo do funil é 100% por definição, não 0%.
		expect(porEstagio.get("qualificado")?.percentDaAnterior).toBe(100);
	});

	it("mede o TEMPO gasto em cada estágio, não a idade do lead", async () => {
		await leadComTrilha([
			{ de: "novo", para: "na_administradora", em: new Date("2026-08-05T00:00:00Z") },
			// Exatas 10 horas depois.
			{ de: "na_administradora", para: "em_atendimento", em: new Date("2026-08-05T10:00:00Z") },
		]);

		const funil = await computeFunilDeHandoff(DE, ATE);
		const naAdm = funil.etapas.find((e) => e.estagio === "na_administradora");
		expect(naAdm?.horasP50).not.toBeNull();
		expect(naAdm?.horasP50).toBeGreaterThan(0);
	});

	it("estágio sem saída registrada não vira tempo zero", async () => {
		// O lead que ENTROU num estágio e não saiu ainda não tem duração — contá-lo
		// como zero puxaria a mediana para baixo e a tela diria que a mesa é rápida
		// justamente por causa de quem está parado.
		//
		// ── Correção de 02/10/2026: por que a prova é de AMOSTRA CONTROLADA ──────
		//
		// A versão anterior varria TODAS as etapas e exigia p50 > 0 em cada uma
		// que tivesse amostra. Isso media dado que o teste não criou: o banco deste
		// workspace tem 13 leads de CARGA de 14/08 com ~5 s entre estágios, e
		// `numOuNulo` arredonda hora a uma casa decimal — 0,0017 h vira 0. A
		// varredura então acusava "tempo zero" (`qualificado: expected 0 to be
		// greater than 0`) sobre transições rápidas e reais, que nada têm a ver com
		// quem ficou parado. Zero de arredondamento não é zero de "ninguém saiu";
		// quem separa os dois é o NULL, e é ele que se afirma aqui.
		//
		// `aguardando_pagamento` e `fechado_ganho` são os estágios que nenhum dado
		// do banco alcança, então a amostra deles é só a destes dois leads:
		//
		//   • o que ENTRA e FICA (sem saída) não vira amostra — p50 nulo;
		//   • o que ENTRA e sai em 3 h responde 3 h. Se o parado entrasse como zero,
		//     a mediana de duas amostras (0 h e 3 h) seria 1,5 h.
		await leadComTrilha([
			{ de: "novo", para: "aguardando_pagamento", em: new Date("2026-08-15T08:00:00Z") },
		]);
		await leadComTrilha([
			{ de: "novo", para: "aguardando_pagamento", em: new Date("2026-08-15T10:00:00Z") },
			{ de: "aguardando_pagamento", para: "fechado_ganho", em: new Date("2026-08-15T13:00:00Z") },
		]);

		const funil = await computeFunilDeHandoff(DE, ATE);

		const comSaida = funil.etapas.find((e) => e.estagio === "aguardando_pagamento");
		expect(comSaida?.alcancaram).toBe(2);
		expect(comSaida?.horasP50).toBe(3);

		const semSaida = funil.etapas.find((e) => e.estagio === "fechado_ganho");
		expect(semSaida?.alcancaram).toBe(1);
		expect(semSaida?.horasP50).toBeNull();
	});

	it("lead simulado não entra no funil da operação", async () => {
		const antes = await computeFunilDeHandoff(DE, ATE);
		await leadComTrilha(
			[{ de: "novo", para: "fechado_ganho", em: new Date("2026-08-20T12:00:00Z") }],
			{ simulado: true, nome: "Simulado" },
		);
		const depois = await computeFunilDeHandoff(DE, ATE);

		const fechadosAntes = antes.etapas.find((e) => e.estagio === "fechado_ganho")?.alcancaram;
		const fechadosDepois = depois.etapas.find((e) => e.estagio === "fechado_ganho")?.alcancaram;
		expect(fechadosDepois).toBe(fechadosAntes);
	});

	it("ida e volta no funil conta UMA pessoa por etapa", async () => {
		// O funil real admite regressão (um lead volta de `perdido` para
		// `em_atendimento`). Contar as duas passagens como duas pessoas faria a
		// etapa ter mais gente do que a anterior.
		//
		// Medido por DIFERENÇA — antes e depois de inserir o lead —, e não por um
		// teto folgado: `toBeLessThan(passagens + 100)` passaria com qualquer
		// número e mediria o próprio teste.
		const antes = await computeFunilDeHandoff(DE, ATE);
		const emAtendimentoAntes =
			antes.etapas.find((e) => e.estagio === "em_atendimento")?.alcancaram ?? 0;

		const leadId = await leadComTrilha([
			{ de: "novo", para: "em_atendimento", em: new Date("2026-08-06T10:00:00Z") },
			{ de: "em_atendimento", para: "aguardando_pagamento", em: new Date("2026-08-07T10:00:00Z") },
			{ de: "aguardando_pagamento", para: "em_atendimento", em: new Date("2026-08-08T10:00:00Z") },
		]);

		const eventos = await db.query.leadEvents.findMany({});
		const passagens = eventos.filter(
			(e) => e.leadId === leadId && e.toStage === "em_atendimento",
		).length;
		expect(passagens).toBe(2);

		const depois = await computeFunilDeHandoff(DE, ATE);
		const emAtendimentoDepois =
			depois.etapas.find((e) => e.estagio === "em_atendimento")?.alcancaram ?? 0;

		// Duas passagens, UMA pessoa a mais na etapa.
		expect(emAtendimentoDepois - emAtendimentoAntes).toBe(1);
	});

	it("a taxa entre etapas sobrevive ao PULO de estágio — nunca passa de 100%", async () => {
		// `transitionLeadStage` é forward-only e não grava os estágios pulados. Um
		// lead que vai de `qualificado` direto para `proposta_enviada` — três
		// ocorrências no recorte de produção de 30/08 — nunca aparece em
		// `em_negociacao`. Com denominador ingênuo, a etapa seguinte exibiria mais
		// de 100% "da anterior": um funil que cresce, que é o defeito que a tela
		// vizinha já documenta.
		await leadComTrilha([
			{ de: "novo", para: "qualificado", em: new Date("2026-08-14T09:00:00Z") },
			// Pula `em_negociacao`.
			{ de: "qualificado", para: "proposta_enviada", em: new Date("2026-08-14T10:00:00Z") },
		]);

		const funil = await computeFunilDeHandoff(DE, ATE);
		for (const etapa of funil.etapas) {
			expect(etapa.percentDaAnterior, etapa.estagio).toBeLessThanOrEqual(100);
		}
	});

	it("o acumulado para a frente é monotônico — é o que faz a taxa fechar", async () => {
		const funil = await computeFunilDeHandoff(DE, ATE);
		for (let i = 1; i < funil.etapas.length; i++) {
			expect(
				funil.etapas[i - 1].alcancaramOuAlem,
				`${funil.etapas[i - 1].estagio} → ${funil.etapas[i].estagio}`,
			).toBeGreaterThanOrEqual(funil.etapas[i].alcancaramOuAlem);
		}
	});

	it("declara quando a amostra não sustenta taxa de fechamento", async () => {
		// Com n baixo, qualquer taxa depois de "proposta enviada" é hipótese — e a
		// tela precisa dizer isso em vez de deixar o leitor supor. O que se afirma
		// aqui é a REGRA (10 propostas), não o tipo do campo.
		const funil = await computeFunilDeHandoff(DE, ATE);
		const propostas = funil.etapas.find((e) => e.estagio === "proposta_enviada")?.alcancaram ?? 0;
		expect(funil.amostraSuficiente).toBe(propostas >= 10);
	});
});

describeIfDb("D3/E1 — a campainha do SLA (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let computeLeadsParados: typeof import("./handoff-queries").computeLeadsParados;

	const convIds: string[] = [];
	const leadIds: string[] = [];

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		({ computeLeadsParados } = await import("./handoff-queries"));
	});

	afterAll(async () => {
		if (leadIds.length > 0) {
			await db.delete(schema.leadEvents).where(inArray(schema.leadEvents.leadId, leadIds));
			await db.delete(schema.leads).where(inArray(schema.leads.id, leadIds));
		}
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
	});

	async function leadParadoHa(
		horas: number,
		stage: string,
		nome: string,
		telefone = "11988887777",
		simulado = false,
	) {
		const [conv] = await db
			.insert(schema.conversations)
			.values({ channel: "web" })
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		const quando = new Date(Date.now() - horas * 3600_000);
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				name: nome,
				phone: telefone,
				isSimulated: simulado,
				stage: stage as never,
				createdAt: quando,
				updatedAt: quando,
			})
			.returning({ id: schema.leads.id });
		leadIds.push(lead.id);
		return lead.id;
	}

	it("acha quem está parado além do limite", async () => {
		const id = await leadParadoHa(50, "proposta_enviada", "Parado 50h");
		const parados = await computeLeadsParados(24);

		const achado = parados.find((p) => p.leadId === id);
		expect(achado).toBeTruthy();
		expect(achado?.horasParado).toBeGreaterThan(24);
		// O nome e o telefone vêm junto: uma lista de UUIDs não faz ninguém ligar
		// para ninguém.
		expect(achado?.nome).toBe("Parado 50h");
		expect(achado?.telefone).toBeTruthy();
	});

	it("não acusa quem foi mexido dentro do limite", async () => {
		const id = await leadParadoHa(2, "em_negociacao", "Recente");
		const parados = await computeLeadsParados(24);
		expect(parados.find((p) => p.leadId === id)).toBeUndefined();
	});

	it("estágio TERMINAL não é lead abandonado", async () => {
		// Parado em `fechado_ganho` há um mês é o fim da história, não uma venda
		// esquecida. Um alarme que acusa isso é um alarme que a mesa desliga.
		const ganho = await leadParadoHa(720, "fechado_ganho", "Ganho antigo");
		const perdido = await leadParadoHa(720, "perdido", "Perdido antigo");
		const parados = await computeLeadsParados(24);

		expect(parados.find((p) => p.leadId === ganho)).toBeUndefined();
		expect(parados.find((p) => p.leadId === perdido)).toBeUndefined();
	});

	it("o mais antigo vem primeiro — é quem a mesa tem que ligar agora", async () => {
		await leadParadoHa(100, "em_atendimento", "Mais antigo");
		await leadParadoHa(30, "em_atendimento", "Menos antigo");
		const parados = await computeLeadsParados(24);

		for (let i = 1; i < parados.length; i++) {
			expect(parados[i - 1].horasParado).toBeGreaterThanOrEqual(parados[i].horasParado);
		}
	});

	it("lead PRÉ-handoff não entra na lista — a mesa nunca o recebeu", async () => {
		// `engajado` é estágio do bot, não da mesa: o funil de handoff começa em
		// `qualificado`. Um terço da lista seria de gente que ninguém deveria
		// cobrar — e é assim que o alarme vira ruído e é desligado.
		const id = await leadParadoHa(200, "engajado", "Ainda com o bot");
		expect((await computeLeadsParados(24)).find((p) => p.leadId === id)).toBeUndefined();
	});

	it("o relógio não é zerado por escrita de manutenção na linha", async () => {
		// `leads.updated_at` tem `$onUpdate`: um backfill de contatos bumpa a
		// coluna e zeraria o SLA de todo mundo em silêncio. O relógio é a última
		// TRANSIÇÃO de estágio, que é append-only.
		const { db } = await import("@/db");
		const schemaMod = await import("@/db/schema");
		const { eq } = await import("drizzle-orm");

		const id = await leadParadoHa(60, "proposta_enviada", "Esquecido há 60h");
		// Simula o backfill: toca a linha AGORA, sem nenhuma transição de estágio.
		await db
			.update(schemaMod.leads)
			.set({ name: "Esquecido há 60h " })
			.where(eq(schemaMod.leads.id, id));

		const achado = (await computeLeadsParados(24)).find((p) => p.leadId === id);
		expect(
			achado,
			"o lead esquecido não pode sumir da lista por causa de um backfill",
		).toBeTruthy();
		expect(achado?.horasParado).toBeGreaterThan(24);
	});

	it("o limite é parâmetro — a mesa aperta quando o processo suportar", async () => {
		const id = await leadParadoHa(10, "proposta_enviada", "Parado 10h");
		expect((await computeLeadsParados(24)).find((p) => p.leadId === id)).toBeUndefined();
		expect((await computeLeadsParados(5)).find((p) => p.leadId === id)).toBeTruthy();
	});

	it("o TESTE DE CASA não vira 'lead parado' no e-mail da mesa", async () => {
		// Medido em 23/09/2026: o dono testou o fluxo com o próprio celular. Como o
		// teste rodou em WhatsApp real, o lead nasceu `is_simulated = false`, passou
		// pelo filtro da consulta e a campainha acusou "lead parado" que era teste
		// de casa — a atendente recebeu, a cliente viu e perguntou por quê.
		const id = await leadParadoHa(50, "proposta_enviada", "Teste do dono", "556292496793");
		expect((await computeLeadsParados(24)).find((p) => p.leadId === id)).toBeUndefined();
	});

	it("o mesmo aparelho no formato SEM o nono dígito também sai", async () => {
		// A Meta devolve wa_id brasileiro no formato legado (sem o nono dígito) e o
		// web grava com ele: comparar string deixaria o mesmo celular entrar por
		// uma das portas.
		const id = await leadParadoHa(50, "proposta_enviada", "Teste sem nono", "62992496793");
		expect((await computeLeadsParados(24)).find((p) => p.leadId === id)).toBeUndefined();
	});

	it("e o CLIENTE real, na MESMA chamada, continua entrando — o alarme não zera", async () => {
		const teste = await leadParadoHa(50, "proposta_enviada", "Teste do dono", "556292496793");
		const cliente = await leadParadoHa(60, "proposta_enviada", "Cliente real", "11988887777");
		const parados = await computeLeadsParados(24);

		expect(parados.find((p) => p.leadId === teste)).toBeUndefined();
		expect(parados.find((p) => p.leadId === cliente)).toBeTruthy();
	});

	it("lead SIMULADO continua fora — a guarda antiga segue valendo", async () => {
		const id = await leadParadoHa(50, "proposta_enviada", "Simulado", "11988887777", true);
		expect((await computeLeadsParados(24)).find((p) => p.leadId === id)).toBeUndefined();
	});

	// ── D10: a lista DO PERÍODO x a lista GLOBAL ───────────────────────────────
	//
	// A Performance mostrava "Parados há mais de 24h" com o rótulo do período
	// escolhido e a população de TODOS os períodos: com o filtro em "Hoje", o
	// bloco do dia listava gente de julho. O que fecha com o resto do funil é a
	// janela de `leads.created_at` (nascimento do lead); a lista global continua
	// existindo para a tela de Remarketing, onde a pergunta é "quem a mesa precisa
	// ligar agora".

	it("parado DO PERÍODO: quem nasceu antes da janela não entra na lista recortada", async () => {
		const agora = new Date();
		const agoraMaisUm = new Date(agora.getTime() + 60_000);
		const inicioDeHoje = new Date(`${agora.toISOString().slice(0, 10)}T00:00:00.000Z`);

		// Nasceu há 10 dias e continua sem toque: é o caso "parado há 10 dias".
		const antigo = await leadParadoHa(240, "proposta_enviada", "Parado há 10 dias", "11977776666");

		// Período "Hoje": ele nasceu ANTES da janela e fica de fora.
		const deHoje = await computeLeadsParados(24, { de: inicioDeHoje, ate: agoraMaisUm });
		expect(deHoje.find((p) => p.leadId === antigo)).toBeUndefined();

		// A GLOBAL continua incluindo — é ela que a tela de Remarketing mostra.
		const global = await computeLeadsParados(24);
		expect(global.find((p) => p.leadId === antigo)).toBeTruthy();

		// E a janela que cobre o nascimento dele também inclui: o recorte é por
		// `created_at`, e não por "parou dentro da janela".
		const trintaDias = await computeLeadsParados(24, {
			de: new Date(agora.getTime() - 30 * 24 * 3600_000),
			ate: agoraMaisUm,
		});
		expect(trintaDias.find((p) => p.leadId === antigo)).toBeTruthy();
	});

	it("parado DO PERÍODO: a janela não esconde quem já está parado dentro dela", async () => {
		const agora = new Date();
		const janela = {
			de: new Date(agora.getTime() - 2 * 24 * 3600_000),
			ate: new Date(agora.getTime() + 60_000),
		};

		// Nasceu 40 h atrás e segue sem toque: dentro da janela e acima do limite.
		const parado = await leadParadoHa(
			40,
			"proposta_enviada",
			"Parado dentro da janela",
			"11955554444",
		);
		// Nascido AGORA e sem toque: está na janela, mas parado há menos de 24 h —
		// o limite do SLA continua valendo DENTRO do período, que é o ponto: a
		// janela recorta o nascimento, não o limite.
		const novo = await leadParadoHa(0, "proposta_enviada", "Nascido agora", "11966665555");

		const doPeriodo = await computeLeadsParados(24, janela);
		expect(doPeriodo.find((p) => p.leadId === parado)).toBeTruthy();
		expect(doPeriodo.find((p) => p.leadId === parado)?.horasParado).toBeGreaterThan(24);
		expect(doPeriodo.find((p) => p.leadId === novo)).toBeUndefined();
	});

	// ── O recorte por braço vale também aqui ────────────────────────────────
	//
	// A lista de parados é lida nas DUAS telas que têm o seletor de braço
	// (Performance e Remarketing). Um número que ignora o filtro ativo é a mesma
	// classe de defeito do período ignorado — e a condição SQL do braço entra pela
	// MESMA função que o funil usa (`condicaoDeBracoNaConversa`), sobre o JOIN com
	// `conversations`.

	async function leadParadoNoBraco(braco: string | null) {
		const { CHAVE_DO_TESTE_NO_METADATA } = await import("@/lib/chat/variante-da-visita");
		const [conv] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				metadata: braco === null ? null : { [CHAVE_DO_TESTE_NO_METADATA]: { variante: braco } },
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conv.id);

		const quando = new Date(Date.now() - 50 * 3600_000);
		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conv.id,
				name: `Parado ${braco ?? "sem braço"}`,
				phone: "11944443333",
				isSimulated: false,
				stage: "proposta_enviada" as never,
				createdAt: quando,
				updatedAt: quando,
			})
			.returning({ id: schema.leads.id });
		leadIds.push(lead.id);
		return lead.id;
	}

	it("o recorte por braço vale também na lista de parados", async () => {
		const { CHAVE_DO_TESTE_NO_METADATA } = await import("@/lib/chat/variante-da-visita");
		const noA = await leadParadoNoBraco("A");
		const semBraco = await leadParadoNoBraco(null);

		const doA = await computeLeadsParados(24, undefined, [
			{ experimento: CHAVE_DO_TESTE_NO_METADATA, braco: "A" },
		]);
		expect(doA.find((p) => p.leadId === noA)).toBeTruthy();
		expect(doA.find((p) => p.leadId === semBraco)).toBeUndefined();

		const semVariante = await computeLeadsParados(24, undefined, [
			{ experimento: CHAVE_DO_TESTE_NO_METADATA, braco: "sem-variante" },
		]);
		expect(semVariante.find((p) => p.leadId === semBraco)).toBeTruthy();
		expect(semVariante.find((p) => p.leadId === noA)).toBeUndefined();
	});
});
