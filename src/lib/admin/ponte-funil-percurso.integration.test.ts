// A PONTE entre o funil de mídia e o Percurso, contra Postgres real.
//
// O operador viu isto em 23/09/2026: o funil dizia 10 em "Se identificaram", ele
// clicou, e a lista respondeu por 8. Os dois números estavam certos e falavam de
// populações diferentes — o degrau contava CONVERSA e a lista, PESSOA.
//
// Depois do FIX-370 os dois contam pessoa. O que este arquivo prova é que a
// PONTE fecha: para a mesma janela e o mesmo degrau, o número da barra, o total
// da lista que o clique abre (`modo=alcancou`) e o `alcancaram` do resumo são o
// MESMO número.
//
// Skip se DATABASE_URL ausente (mesmo padrão dos outros de integração).

import { inArray } from "drizzle-orm";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { CHIP_DE_BEM } from "@/lib/funil/textos-do-cta";
import { ETAPAS_FUNIL_MIDIA } from "./performance-types";
import { PASSO_DA_ETAPA_DO_FUNIL } from "./percurso-types";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Janela sorteada (como no resto do arquivo de Percurso): o Postgres é
// compartilhado entre os agentes da onda, e uma janela fixa faria uma execução
// enxergar as sementes da outra.
const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const JANELA_DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const JANELA_ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/**
 * A escada do Percurso × a etapa do funil que o clique abre.
 *
 * `visitas` fica fora: a etapa inteira é a tela sem filtro, e não tem degrau.
 */
const ETAPAS_DA_PONTE = ETAPAS_FUNIL_MIDIA.filter((e) => e.chave !== "visitas");

describeIfDb("a ponte funil → percurso abre a MESMA população (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let performance: typeof import("./performance-queries");
	let percurso: typeof import("./percurso-queries");

	const visitas: string[] = [];
	const conversas: string[] = [];

	afterAll(async () => {
		if (conversas.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, conversas));
		}
		if (visitas.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitas));
		}
	});

	/**
	 * Uma jornada — do clique no anúncio até onde a pessoa chegou.
	 *
	 * `ate` segue a ordem REAL do produto: a Bevi exige CPF pra simular, então
	 * quem vê oferta já se identificou. Inverter produziria um funil que cresce.
	 */
	async function jornada(
		visitante: string,
		ate: "engajou" | "so_pre_preenchida" | "identificou" | "oferta" | "proposta" | "fechou",
		opcoes: { canal?: "web" | "whatsapp"; semLead?: boolean } = {},
	): Promise<void> {
		const canal = opcoes.canal ?? "web";

		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: visitante,
				channel: canal,
				createdAt: DENTRO,
				userAgent: UA_GENTE,
				utmSource: "facebook",
				utmCampaign: "ponte",
			})
			.returning({ id: schema.visits.id });
		visitas.push(visita.id);

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: canal,
				visitId: visita.id,
				waId: canal === "whatsapp" ? `55119${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` : null,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.conversations.id });
		conversas.push(conversa.id);

		const [mensagem] = await db
			.insert(schema.messages)
			.values({
				conversationId: conversa.id,
				role: "user",
				content: ate === "so_pre_preenchida" ? CHIP_DE_BEM.auto : "quero um carro",
				channel: canal,
				createdAt: DENTRO,
			})
			.returning({ id: schema.messages.id });

		// Só mandou a mensagem do anúncio: para aqui, e é RAMIFICAÇÃO — não é o
		// degrau anterior de quem iniciou a conversa.
		if (ate === "so_pre_preenchida" || ate === "engajou") return;

		// A conversa de WhatsApp sem linha em `leads` é identificada pelo CANAL —
		// é o caso que o `EXISTS` (e não o `JOIN`) existe para não perder.
		if (opcoes.semLead) return;

		const [lead] = await db
			.insert(schema.leads)
			.values({
				conversationId: conversa.id,
				name: "Cliente da Ponte",
				phone: "+5511900000000",
				stage: ate === "fechou" ? "fechado_ganho" : "qualificado",
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.leads.id });
		if (ate === "identificou") return;

		await db
			.insert(schema.artifacts)
			.values({ messageId: mensagem.id, type: "real_offer", payload: {}, createdAt: DENTRO });
		if (ate === "oferta") return;

		await db.insert(schema.beviProposals).values({
			conversationId: conversa.id,
			leadId: lead.id,
			proposalId: `prop-${crypto.randomUUID()}`,
			createdAt: DENTRO,
			updatedAt: DENTRO,
		});
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		performance = await import("./performance-queries");
		percurso = await import("./percurso-queries");

		// Uma pessoa por degrau — e as duas bordas que fizeram o teste valer a pena:
		// a conversa de WhatsApp SEM lead e a pessoa que voltou (duas conversas).
		await jornada(`v-${crypto.randomUUID()}`, "engajou");
		await jornada(`v-${crypto.randomUUID()}`, "so_pre_preenchida");
		await jornada(`v-${crypto.randomUUID()}`, "identificou");
		await jornada(`v-${crypto.randomUUID()}`, "oferta");
		await jornada(`v-${crypto.randomUUID()}`, "proposta");
		await jornada(`v-${crypto.randomUUID()}`, "fechou");
		await jornada(`v-${crypto.randomUUID()}`, "engajou", { canal: "whatsapp", semLead: true });

		const queVoltou = `v-${crypto.randomUUID()}`;
		await jornada(queVoltou, "engajou");
		await jornada(queVoltou, "proposta");
	});

	it("o número do degrau é o total da lista que o clique abre — e o alcancaram", async () => {
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		const porChave = new Map(funil.map((e) => [e.chave, e.count]));

		for (const etapa of ETAPAS_DA_PONTE) {
			const passo = PASSO_DA_ETAPA_DO_FUNIL[etapa.chave];
			if (!passo) throw new Error(`a etapa ${etapa.chave} não tem degrau no Percurso`);

			const lista = await percurso.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				passo,
				modo: "alcancou",
			});
			const alcancaram = lista.resumo.find((r) => r.chave === passo)?.alcancaram ?? 0;
			const naBarra = porChave.get(etapa.chave) ?? 0;

			expect(
				lista.total,
				`${etapa.label}: a lista abriu ${lista.total} e a barra diz ${naBarra}`,
			).toBe(naBarra);
			expect(
				alcancaram,
				`${etapa.label}: o resumo diz ${alcancaram} e a barra diz ${naBarra}`,
			).toBe(naBarra);
		}
	});

	it("a pessoa que voltou conta UMA vez em cada degrau, dos dois lados", async () => {
		// O caso que a cliente viveu: duas conversas, uma pessoa. Se qualquer das
		// duas pontas voltasse a contar conversa, este número viraria 9.
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		expect(funil.find((e) => e.chave === "conversas")?.count).toBe(8);

		const lista = await percurso.listarPercurso({ from: JANELA_DE, to: JANELA_ATE });
		expect(lista.totalDePessoas).toBe(8);
	});

	it("a conversa de WhatsApp sem linha em `leads` é identificada nas duas pontas", async () => {
		// É a metade das conversas de WhatsApp medidas em produção. O funil conta
		// pelo `wa_id` (EXISTS) e o Percurso pela mesma definição — se um dos dois
		// voltar a exigir lead, o degrau cai para 5 e a ponte quebra.
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		expect(funil.find((e) => e.chave === "identificados")?.count).toBe(6);

		const lista = await percurso.listarPercurso({
			from: JANELA_DE,
			to: JANELA_ATE,
			passo: "se_identificou",
			modo: "alcancou",
		});
		expect(lista.total).toBe(6);
	});

	it("a ramificação não abre a lista de quem passou por ela a caminho do fundo", async () => {
		// "Só mandou a mensagem do anúncio" é RAMIFICAÇÃO: quem iniciou a conversa
		// TAMBÉM mandou a mensagem do anúncio antes. Filtrando por posição na
		// escada, o clique em 1 abria a lista de 7 — o degrau lido e a lista aberta
		// deixavam de ser a mesma população.
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		const naBarra = funil.find((e) => e.chave === "so_pre_preenchida")?.count ?? 0;
		expect(naBarra).toBe(1);

		const lista = await percurso.listarPercurso({
			from: JANELA_DE,
			to: JANELA_ATE,
			passo: "so_pre_preenchida",
			modo: "alcancou",
		});
		expect(lista.total).toBe(naBarra);
	});
});