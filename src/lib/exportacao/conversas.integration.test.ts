// EXPORTAR CONVERSAS — uma linha por mensagem, com autoria (integration-db).
//
// O que este arquivo protege é o gap que o pedido do Gustavo nomeia: o export
// antigo agregava por PESSOA e contava mensagens; a growth precisa ler a
// conversa como ela foi. Então o primeiro teste não é "tem colunas" — é
// "toda mensagem do recorte está aqui, com a autoria certa e na ordem certa".
//
// Janela de data sorteada por execução, no mesmo molde de
// `percurso-queries.integration.test.ts`: o Postgres é compartilhado entre os
// agentes e uma janela fixa faria duas execuções verem os dados uma da outra.

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LinhaExportada } from "./formato";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const ANO = 1970 + Math.floor(Math.random() * 45);
const MES = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
const DE = new Date(`${ANO}-${MES}-01T00:00:00Z`);
const ATE = new Date(`${ANO}-${MES}-28T23:59:59Z`);
const DENTRO = new Date(`${ANO}-${MES}-15T12:00:00Z`);

describeIfDb("exportação — conversas mensagem a mensagem (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let conversas: typeof import("./conversas");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	async function semearConversa(args: {
		comVisita: boolean;
		comLead: boolean;
		utmCampaign?: string;
		quando?: Date;
	}): Promise<string> {
		const quando = args.quando ?? DENTRO;
		let visitId: string | null = null;
		if (args.comVisita) {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: `v-${crypto.randomUUID()}`,
					channel: "web",
					utmSource: "facebook",
					utmMedium: "cpc",
					utmCampaign: args.utmCampaign ?? "exp-a",
					utmContent: "criativo-1",
					createdAt: quando,
				})
				.returning({ id: schema.visits.id });
			visitId = visita.id;
			visitIds.push(visita.id);
		}

		const [conversa] = await db
			.insert(schema.conversations)
			.values({
				channel: "web",
				visitId,
				isSimulated: false,
				createdAt: quando,
				updatedAt: quando,
			})
			.returning({ id: schema.conversations.id });
		convIds.push(conversa.id);

		// Mensagens na ordem em que aconteceram: cliente, agente (persona), mesa
		// (assistant sem persona) e nota de sistema.
		const falas: Array<{
			role: "user" | "assistant" | "system";
			content: string;
			personaId?: string | null;
		}> = [
			{ role: "user", content: "quero uma moto" },
			{ role: "assistant", content: "Claro! Qual valor?", personaId: "vendedor" },
			{ role: "assistant", content: "Oi, sou o atendente da mesa.", personaId: null },
			{ role: "assistant", content: "[sistema] atendimento encerrado", personaId: null },
		];
		let indice = 0;
		for (const fala of falas) {
			indice += 1;
			const [mensagem] = await db
				.insert(schema.messages)
				.values({
					conversationId: conversa.id,
					role: fala.role,
					content: fala.content,
					personaId: fala.personaId ?? null,
					createdAt: new Date(quando.getTime() + indice * 60_000),
				})
				.returning({ id: schema.messages.id });
			// Um card na segunda mensagem, para o `tipo` ser exercitado.
			if (indice === 2) {
				await db
					.insert(schema.artifacts)
					.values({ messageId: mensagem.id, type: "real_offer", payload: {}, createdAt: DENTRO });
			}
		}

		if (args.comLead) {
			const [lead] = await db
				.insert(schema.leads)
				.values({
					conversationId: conversa.id,
					name: "Maria Graciete Souza",
					phone: "+5562988887777",
					email: "maria@dominio.com",
					stage: "qualificado",
					isSimulated: false,
					createdAt: quando,
					updatedAt: quando,
				})
				.returning({ id: schema.leads.id });

			await db.insert(schema.leadEvents).values([
				{
					leadId: lead.id,
					fromStage: "novo",
					toStage: "engajado",
					actorType: "system",
					createdAt: new Date(quando.getTime() + 30_000),
				},
				{
					leadId: lead.id,
					fromStage: "engajado",
					toStage: "qualificado",
					actorType: "system",
					createdAt: new Date(quando.getTime() + 4 * 60_000),
				},
			]);
		}

		return conversa.id;
	}

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		conversas = await import("./conversas");
	});

	afterAll(async () => {
		if (convIds.length > 0) {
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	it("toda mensagem do recorte sai, em ordem cronológica, com autoria", async () => {
		const comVisita = await semearConversa({ comVisita: true, comLead: true });
		const linhas = await conversas.exportarConversas({
			de: DE,
			ate: ATE,
			conversationIds: [comVisita],
		});

		expect(linhas).toHaveLength(4);
		expect(linhas.map((l) => l.autoria)).toEqual(["cliente", "agente", "atendente", "sistema"]);
		expect(linhas.map((l) => l.ordem)).toEqual(["1", "2", "3", "4"]);
		// cresce no tempo
		const instantes = linhas.map((l) => new Date(l.criadoEm).getTime());
		expect([...instantes].sort((a, b) => a - b)).toEqual(instantes);
	});

	it("casa o card na mensagem que o gerou", async () => {
		const comVisita = await semearConversa({ comVisita: true, comLead: true });
		const linhas = await conversas.exportarConversas({
			de: DE,
			ate: ATE,
			conversationIds: [comVisita],
		});
		expect(linhas[1].tipo).toBe("card");
		expect(linhas[0].tipo).toBe("texto");
	});

	it("leva a etapa NO MOMENTO da mensagem e a etapa final", async () => {
		const comVisita = await semearConversa({ comVisita: true, comLead: true });
		const linhas = await conversas.exportarConversas({
			de: DE,
			ate: ATE,
			conversationIds: [comVisita],
		});

		// A primeira mensagem (t=+1min) já é depois do evento "engajado" (+30s) e
		// antes do "qualificado" (+4min).
		expect(linhas[0].etapaNoMomento).toBe("engajado");
		expect(linhas[0].etapaFinal).toBe("qualificado");
		expect(linhas[0].resultadoComercial).toBe("qualificado");
	});

	it("declara o vínculo ausente em vez de deixar célula em branco", async () => {
		const semVisita = await semearConversa({ comVisita: false, comLead: false });
		const linhas = await conversas.exportarConversas({
			de: DE,
			ate: ATE,
			conversationIds: [semVisita],
		});

		expect(linhas[0].origemFonte).toContain("sem vínculo: conversa sem visita");
		expect(linhas[0].contatoId).toContain("sem vínculo: conversa sem contato");
		expect(linhas[0].leadId).toContain("sem vínculo: conversa sem lead");
		expect(linhas[0].etapaNoMomento).toBe("sem etapa registrada");
		expect(linhas[0].remarketingStatus).toContain("sem vínculo: conversa fora da régua");
		expect(linhas[0].dadosIndisponiveis).toContain("sem vínculo: conversa sem visita");
		// Nenhuma célula vazia — a regra do pedido.
		for (const valor of Object.values(linhas[0])) expect(valor).not.toBe("");
	});

	it("declara experimento e versão como derivados de UTM", async () => {
		const comVisita = await semearConversa({
			comVisita: true,
			comLead: false,
			utmCampaign: "exp-verao",
		});
		const [linha] = await conversas.exportarConversas({
			de: DE,
			ate: ATE,
			conversationIds: [comVisita],
		});
		expect(linha.experimento).toBe("exp-verao");
		expect(linha.versao).toBe("criativo-1");

		const semVisita = await semearConversa({ comVisita: false, comLead: false });
		const [sem] = await conversas.exportarConversas({
			de: DE,
			ate: ATE,
			conversationIds: [semVisita],
		});
		expect(sem.experimento).toBe("não estruturado: derivado de utm_campanha");
		expect(sem.versao).toBe("não estruturado: derivado de utm_conteudo");
	});

	it("a contagem do recorte bate com a contagem de origem", async () => {
		const id = await semearConversa({ comVisita: true, comLead: true });
		const linhas = await conversas.exportarConversas({
			de: DE,
			ate: ATE,
			conversationIds: [id],
		});
		const contagem = await conversas.contarConversas({ de: DE, ate: ATE, conversationIds: [id] });
		expect(linhas).toHaveLength(contagem.mensagens);
		expect(contagem.conversas).toBe(1);
	});

	it("o limite trava nas N conversas mais recentes", async () => {
		await semearConversa({
			comVisita: true,
			comLead: false,
			quando: new Date(DENTRO.getTime() + 1 * 3_600_000),
		});
		const maisRecente = await semearConversa({
			comVisita: true,
			comLead: false,
			quando: new Date(DENTRO.getTime() + 2 * 3_600_000),
		});
		const linhas = await conversas.exportarConversas({ de: DE, ate: ATE, limiteConversas: 1 });
		const ids = new Set(linhas.map((l) => l.conversaId));
		expect(ids.size).toBe(1);
		// As duas conversas semeadas aqui são as mais recentes da janela — e a
		// escolhida é a de mensagem mais nova.
		expect([...ids][0]).toBe(maisRecente);
	});

	it("cada linha traz exatamente as colunas do pedido", async () => {
		const id = await semearConversa({ comVisita: true, comLead: true });
		const [linha] = (await conversas.exportarConversas({
			de: DE,
			ate: ATE,
			conversationIds: [id],
		})) as LinhaExportada[];
		expect(Object.keys(linha)).toEqual([
			"conversaId",
			"contatoId",
			"leadId",
			"canal",
			"origemFonte",
			"origemMeio",
			"origemCampanha",
			"origemConteudo",
			"experimento",
			"versao",
			"msgId",
			"ordem",
			"autoria",
			"tipo",
			"conteudo",
			"criadoEm",
			"etapaNoMomento",
			"etapaFinal",
			"resultadoComercial",
			"remarketingStatus",
			"remarketingPasso",
			"dadosIndisponiveis",
		]);
	});
});
