// O degrau "Se identificaram" e a unidade de "Propostas", contra Postgres real.
//
// Duas coisas só se provam aqui, e as duas são a razão de o item existir:
//
//   1. **O telefone do WhatsApp não identifica ninguém.** Toda conversa de
//      WhatsApp nasce com o telefone do `waId` no lead, então o predicado antigo
//      contava o CANAL como se fosse o cliente. A cliente viu o número inflado e
//      perguntou por WhatsApp; a decisão (22/09/2026) foi exigir nome junto.
//   2. **Cinco propostas da mesma pessoa são cinco linhas e UMA pessoa.** As duas
//      unidades são legítimas e medem coisas diferentes; o que não pode existir é
//      as duas com o mesmo rótulo na mesma tela.
//
// Skip se DATABASE_URL ausente (mesmo padrão dos outros de integração).

import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

// Janela isolada (2016) para que o que já existe no banco não entre na conta —
// e livre: `performance-queries.integration.test.ts` mede 2019-03 com asserções
// exatas contra o MESMO Postgres, então dividir a janela com ele fazia os
// quatro leads daqui entrarem na conta de lá.
const JANELA_DE = new Date("2016-05-01T00:00:00Z");
const JANELA_ATE = new Date("2016-05-31T23:59:59Z");
const DENTRO = new Date("2016-05-15T12:00:00Z");

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

describeIfDb("identificado pelo cliente × contato conhecido (integration)", () => {
	let db: typeof import("@/db").db;
	let schema: typeof import("@/db/schema");
	let performance: typeof import("./performance-queries");
	let percurso: typeof import("./percurso-queries");

	const visitIds: string[] = [];
	const convIds: string[] = [];

	afterAll(async () => {
		if (convIds.length > 0) {
			await db
				.delete(schema.beviProposals)
				.where(inArray(schema.beviProposals.conversationId, convIds));
			await db.delete(schema.leads).where(inArray(schema.leads.conversationId, convIds));
			await db.delete(schema.conversations).where(inArray(schema.conversations.id, convIds));
		}
		if (visitIds.length > 0) {
			await db.delete(schema.visits).where(inArray(schema.visits.id, visitIds));
		}
	});

	beforeAll(async () => {
		({ db } = await import("@/db"));
		schema = await import("@/db/schema");
		performance = await import("./performance-queries");
		percurso = await import("./percurso-queries");

		/** Uma visita (de gente) + uma conversa com um lead, na janela isolada. */
		async function semearConversa(parcial: {
			canal: "web" | "whatsapp";
			nome: string | null;
			telefone: string | null;
			propostas?: number;
		}): Promise<void> {
			const [visita] = await db
				.insert(schema.visits)
				.values({
					visitorId: `v-${crypto.randomUUID()}`,
					channel: parcial.canal,
					createdAt: DENTRO,
					userAgent: UA_GENTE,
					utmSource: "teste-identificado",
				})
				.returning({ id: schema.visits.id });
			visitIds.push(visita.id);

			const [conversa] = await db
				.insert(schema.conversations)
				.values({
					channel: parcial.canal,
					visitId: visita.id,
					createdAt: DENTRO,
					updatedAt: DENTRO,
				})
				.returning({ id: schema.conversations.id });
			convIds.push(conversa.id);

			const [lead] = await db
				.insert(schema.leads)
				.values({
					conversationId: conversa.id,
					name: parcial.nome,
					phone: parcial.telefone,
					stage: "qualificado",
					createdAt: DENTRO,
					updatedAt: DENTRO,
				})
				.returning({ id: schema.leads.id });

			for (let i = 0; i < (parcial.propostas ?? 0); i++) {
				await db.insert(schema.beviProposals).values({
					conversationId: conversa.id,
					leadId: lead.id,
					proposalId: `prop-${crypto.randomUUID()}`,
					createdAt: DENTRO,
					updatedAt: DENTRO,
				});
			}
		}

		// A: chegou pelo WhatsApp e o canal entregou o telefone — o cliente NÃO
		// informou nada e não tem nome. Não é identificado, mas a régua alcança.
		await semearConversa({ canal: "whatsapp", nome: null, telefone: "+5519900000001" });
		// B: web, informou telefone E o nome chegou ao lead. Identificado.
		await semearConversa({ canal: "web", nome: "Cliente Informou", telefone: "+5519900000002" });
		// C: WhatsApp, mas o pushName deu o nome. Identificado — o canal não é o
		// que desqualifica; a falta do nome é.
		await semearConversa({
			canal: "whatsapp",
			nome: "Cliente Do Zap",
			telefone: "+5519900000003",
		});
		// D: identificado e com CINCO propostas na administradora.
		await semearConversa({
			canal: "web",
			nome: "Cliente Com Propostas",
			telefone: "+5519900000004",
			propostas: 5,
		});
	});

	it("conversa de WhatsApp sem nome não conta como identificada", async () => {
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		const identificados = funil.find((e) => e.chave === "identificados");
		// B, C e D têm nome e contato; A (WhatsApp sem nome) não conta. Sem a
		// correção seriam 4 — o telefone do waId contava o canal como cliente.
		expect(identificados?.count).toBe(3);
	});

	it("o contato conhecido é maior que o identificado — as duas medidas convivem", async () => {
		const origens = await performance.computeOrigens(JANELA_DE, JANELA_ATE);
		const identificados = origens.reduce((soma, l) => soma + l.identificados, 0);
		const comTelefone = origens.reduce((soma, l) => soma + l.comTelefone, 0);
		expect(identificados).toBe(3);
		// Os quatro leads têm telefone; os quatro são alcançáveis pela régua.
		expect(comTelefone).toBe(4);
	});

	it("cinco propostas da mesma pessoa são cinco linhas de proposta", async () => {
		const origens = await performance.computeOrigens(JANELA_DE, JANELA_ATE);
		expect(origens.reduce((soma, l) => soma + l.propostas, 0)).toBe(5);
	});

	it("e UMA pessoa com proposta — a unidade do Percurso", async () => {
		const resposta = await percurso.listarPercurso({
			from: JANELA_DE,
			to: JANELA_ATE,
			passo: "proposta",
			modo: "alcancou",
		});
		expect(resposta.total).toBe(1);
	});
});
