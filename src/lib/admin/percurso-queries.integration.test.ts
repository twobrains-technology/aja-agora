// O PERCURSO de cada pessoa que chegou pela campanha (integration-db).
//
// Mesma disciplina do teste do funil de mídia: Postgres real e uma JANELA DE
// DATA ISOLADA (2019), pra que o que já existe no banco do workspace não entre
// na conta e a asserção possa ser exata, não "maior que zero".
//
// O que este arquivo protege é o motivo da tela existir: quem clicou no anúncio
// e NÃO falou tem que aparecer. Um teste que só semeasse conversa passaria
// verde com a metade que já era visível antes.
//
// Skip se DATABASE_URL ausente.

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PassoDoPercurso } from "./percurso-types";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const JANELA_DE = new Date("2019-05-01T00:00:00Z");
const JANELA_ATE = new Date("2019-05-31T23:59:59Z");
const DENTRO = new Date("2019-05-15T12:00:00Z");
const DEPOIS = new Date("2019-05-16T12:00:00Z");

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

	/** Até onde a pessoa semeada chegou. Espelha os degraus de `PASSOS_DO_PERCURSO`. */
	type Ate =
		| "so_chegou"
		| "olhou_a_pagina"
		| "abriu_o_chat"
		| "escreveu"
		| "se_identificou"
		| "viu_oferta"
		| "proposta"
		| "fechado";

	interface Semente {
		/** Reaproveita o visitante — é assim que se semeia quem voltou. */
		visitorId?: string;
		utmSource?: string;
		utmCampaign?: string;
		referrer?: string;
		userAgent?: string | null;
		landingPath?: string;
		quando?: Date;
		ate: Ate;
		simulada?: boolean;
		perdido?: boolean;
		nome?: string;
		telefone?: string;
	}

	async function semear(semente: Semente): Promise<string> {
		const quando = semente.quando ?? DENTRO;
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: semente.visitorId ?? `v-${crypto.randomUUID()}`,
				channel: "web",
				landingPath: semente.landingPath ?? "/motos",
				createdAt: quando,
				userAgent: semente.userAgent === undefined ? UA_GENTE : semente.userAgent,
				utmSource: semente.utmSource ?? null,
				utmCampaign: semente.utmCampaign ?? null,
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
				channel: "web",
				visitId: visita.id,
				isSimulated: simulada,
				createdAt: quando,
				updatedAt: quando,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);
		if (semente.ate === "abriu_o_chat") return visita.id;

		const [mensagem] = await db
			.insert(schema.messages)
			.values({
				conversationId: conversa.id,
				role: "user",
				content: "quero uma moto",
				createdAt: quando,
			})
			.returning({ id: schema.messages.id });
		if (semente.ate === "escreveu") return visita.id;

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
			// Uma pessoa por degrau — cada uma tem que cair no seu, e em nenhum outro.
			const soChegou = await semear({
				utmSource: "facebook",
				utmCampaign: "camp-a",
				ate: "so_chegou",
			});
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "olhou_a_pagina" });
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "abriu_o_chat" });
			await semear({ utmSource: "facebook", utmCampaign: "camp-a", ate: "escreveu" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "se_identificou" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "viu_oferta" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "proposta" });
			await semear({ utmSource: "google", utmCampaign: "camp-b", ate: "fechado" });

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
				ate: "escreveu",
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

			// A pessoa que voltou soma em `escreveu` (o degrau mais fundo dela).
			expect(porPasso.get("so_chegou")).toBe(1);
			expect(porPasso.get("olhou_a_pagina")).toBe(1);
			expect(porPasso.get("abriu_o_chat")).toBe(1);
			expect(porPasso.get("escreveu")).toBe(2);
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
			expect(voltou[0].passo).toBe("escreveu");
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

			// 8 degraus + 1 que voltou = 9. O health check do ALB não entra.
			expect(totalDePessoas).toBe(9);

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
			expect(por.escreveu).toBe(2);
			expect(por.fechado).toBe(1);
			expect(resumo.reduce((soma, r) => soma + r.pessoas, 0)).toBe(totalDePessoas);
			// 9 pessoas, 10 chegadas — uma delas veio duas vezes.
			expect(totalDeChegadas).toBe(10);
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

		it("filtra por degrau, em 'parou aqui' e em 'chegou ao menos aqui'", async () => {
			const parou = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				passo: "escreveu",
				modo: "parou",
			});
			expect(parou.total).toBe(2);
			expect(parou.pessoas.every((p) => p.passo === "escreveu")).toBe(true);

			const alcancou = await queries.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				passo: "escreveu",
				modo: "alcancou",
			});
			// Quem escreveu ou passou disso: 2 + identificou + oferta + proposta + fechado.
			expect(alcancou.total).toBe(6);

			// O resumo NÃO acompanha o filtro — é o denominador da leitura.
			expect(parou.resumo.reduce((soma, r) => soma + r.pessoas, 0)).toBe(9);
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
			expect(primeira.total).toBe(9);
			expect(segunda.total).toBe(9);
			const repetidas = primeira.pessoas.filter((p) =>
				segunda.pessoas.some((q) => q.chave === p.chave),
			);
			expect(repetidas).toHaveLength(0);
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
});
