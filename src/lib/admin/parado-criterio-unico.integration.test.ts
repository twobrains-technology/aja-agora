// "PARADO" tem UM critério só, no servidor.
//
// A palavra existia em três lugares com três regras: o funil de mídia tinha
// `DIAS_PARA_CONSIDERAR_VIVA = 7` como const local, o Percurso não tinha o
// conceito, e a régua tinha o dela (`parada_ha_mais_de_7_dias`). Três critérios
// para a mesma palavra é o que faz duas telas discordarem na frente do cliente.
//
// O que este arquivo prova é a EQUIVALÊNCIA, e por ID — não só pela contagem: a
// mesma janela tem que produzir o MESMO conjunto de pessoas paradas (e de pessoas
// vivas) no funil e no Percurso, degrau a degrau.
//
// Skip se DATABASE_URL ausente.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const JANELA_DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const JANELA_ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/**
 * O degrau do funil → o degrau do Percurso.
 *
 * Os dois vocabulários já são um só (`PASSO_DA_ETAPA_DO_FUNIL`), mas os dois
 * lêem modos diferentes: o funil agrupa por POSIÇÃO máxima (a pessoa para onde
 * chegou mais fundo) e o Percurso tem `modo=parou` para a mesma pergunta.
 */
const DEGRAUS = [
	["conversas", "abriu_o_chat"],
	["so_pre_preenchida", "so_pre_preenchida"],
	["engajadas", "iniciou_conversa"],
	["identificados", "se_identificou"],
	["viram_oferta", "viu_oferta"],
	["propostas", "proposta"],
	["fechados", "fechado"],
] as const;

describeIfDb("FIX-375 — 'parado' tem um critério só (integration)", () => {
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
	 * Uma pessoa parada num degrau, viva ou não.
	 *
	 * `inboundRecente` grava a última mensagem do CLIENTE agora; `status` é o da
	 * conversa. As duas coisas juntas são o critério — e é o par que a régua e o
	 * funil definiam cada um à sua maneira.
	 */
	async function pessoa(
		visitante: string,
		ate: "engajou" | "proposta",
		estado: { inboundRecente: boolean; status: "active" | "closed" },
	): Promise<void> {
		const [visita] = await db
			.insert(schema.visits)
			.values({
				visitorId: visitante,
				channel: "web",
				createdAt: DENTRO,
				userAgent: UA_GENTE,
				utmSource: "facebook",
				utmCampaign: "parado",
			})
			.returning({ id: schema.visits.id });
		visitas.push(visita.id);

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId: visita.id,
				status: estado.status,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			})
			.returning({ id: schema.conversations.id });
		conversas.push(conversa.id);

		await db.insert(schema.messages).values({
			conversationId: conversa.id,
			role: "user",
			content: "quero um carro",
			createdAt: estado.inboundRecente ? new Date() : DENTRO,
		});

		if (ate === "proposta") {
			await db.insert(schema.beviProposals).values({
				conversationId: conversa.id,
				proposalId: `prop-${crypto.randomUUID()}`,
				createdAt: DENTRO,
				updatedAt: DENTRO,
			});
		}
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		performance = await import("./performance-queries");
		percurso = await import("./percurso-queries");

		// As quatro combinações do critério, uma por pessoa:
		await pessoa(`v-${crypto.randomUUID()}`, "engajou", { inboundRecente: true, status: "active" });
		await pessoa(`v-${crypto.randomUUID()}`, "engajou", {
			inboundRecente: false,
			status: "active",
		});
		// Encerrada não é retomável, por mais recente que a fala seja.
		await pessoa(`v-${crypto.randomUUID()}`, "proposta", { inboundRecente: true, status: "closed" });
		await pessoa(`v-${crypto.randomUUID()}`, "proposta", {
			inboundRecente: true,
			status: "active",
		});
	});

	it("a mesma janela produz o MESMO conjunto de parados e de vivas, por id", async () => {
		const paradas = await performance.pessoasQuePararam(JANELA_DE, JANELA_ATE);

		for (const [etapa, passo] of DEGRAUS) {
			const doFunil = paradas.filter((p) => p.etapa === etapa);
			const lista = await percurso.listarPercurso({
				from: JANELA_DE,
				to: JANELA_ATE,
				passo,
				modo: "parou",
			});

			expect(
				doFunil.map((p) => p.chave).sort(),
				`parados em "${etapa}" divergem entre as telas`,
			).toEqual(lista.pessoas.map((p) => p.chave).sort());

			expect(
				doFunil
					.filter((p) => p.viva)
					.map((p) => p.chave)
					.sort(),
				`vivas em "${etapa}" divergem entre as telas`,
			).toEqual(
				lista.pessoas
					.filter((p) => p.aindaViva)
					.map((p) => p.chave)
					.sort(),
			);
		}
	});

	it("o resumo do Percurso conta o mesmo que a barra do funil", async () => {
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		const porChave = new Map(funil.map((e) => [e.chave, e]));

		const lista = await percurso.listarPercurso({ from: JANELA_DE, to: JANELA_ATE });
		const doResumo = new Map(lista.resumo.map((r) => [r.chave, r]));

		for (const [chaveDaEtapa, passo] of DEGRAUS) {
			const etapa = porChave.get(chaveDaEtapa);
			const noResumo = doResumo.get(passo);

			expect(etapa?.pararamAqui, `parados em "${chaveDaEtapa}"`).toBe(noResumo?.pessoas);
			expect(etapa?.aindaVivas, `vivas em "${chaveDaEtapa}"`).toBe(noResumo?.pessoasVivas);
		}
	});

	it("'ainda viva' exige as DUAS coisas: fala recente e conversa aberta", async () => {
		// Basta UMA pessoa viva em cada degrau — a que falou agora e não foi
		// encerrada. As outras três (inbound velho, conversa encerrada) estão
		// paradas e mortas.
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		const por = Object.fromEntries(funil.map((e) => [e.chave, e.aindaVivas]));

		expect(por.engajadas).toBe(1);
		expect(por.propostas).toBe(1);
	});
});