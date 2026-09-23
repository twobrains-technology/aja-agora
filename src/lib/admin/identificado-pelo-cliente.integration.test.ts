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

		/** Uma visita (de gente) + uma conversa, na janela isolada. */
		async function semearConversa(parcial: {
			canal: "web" | "whatsapp";
			nome: string | null;
			telefone: string | null;
			propostas?: number;
			/** O nome que ficou SÓ na conversa (`contactName`), sem ir ao lead. */
			nomeNaConversa?: string | null;
			/** O telefone do CANAL (`waId`) — a conversa de WhatsApp sempre tem. */
			waId?: string | null;
			/** Conversa sem linha em `leads` (o `B-03` pode não ter criado). */
			semLead?: boolean;
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
					contactName: parcial.nomeNaConversa ?? null,
					waId: parcial.waId ?? null,
					createdAt: DENTRO,
					updatedAt: DENTRO,
				})
				.returning({ id: schema.conversations.id });
			convIds.push(conversa.id);

			// A conversa que não tem linha em `leads` é justamente a que o predicado
			// antigo perdia — a semeadura precisa conseguir produzi-la.
			if (parcial.semLead) return;

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
		// E: o caso que o predicado antigo PERDIA — o nome chegou pelo canal e
		// ficou só em `conversations.contactName`, com o `leads.name` nulo. É a
		// cliente real do WhatsApp medida no banco de produção em 23/09/2026
		// (dez conversas exatamente assim na janela 01–21/09).
		await semearConversa({
			canal: "whatsapp",
			nome: null,
			telefone: "+5519900000005",
			nomeNaConversa: "Cliente So Na Conversa",
			waId: "5519900000005",
		});
		// F: nem linha em `leads` — o nome está na conversa e o contato é o `waId`
		// do canal. Também identificado: quem se identifica é o cliente, não a linha.
		await semearConversa({
			canal: "whatsapp",
			nome: null,
			telefone: null,
			nomeNaConversa: "Cliente Sem Lead",
			waId: "5519900000006",
			semLead: true,
		});
		// G: sem nome em lugar nenhum e sem lead. Não identificado.
		await semearConversa({ canal: "web", nome: null, telefone: null, semLead: true });
		// H: tem NOME, mas nenhum contato (sem lead e sem canal). O nome sozinho
		// não identifica — a exigência de contato continua de pé.
		await semearConversa({
			canal: "web",
			nome: null,
			telefone: null,
			nomeNaConversa: "Cliente Sem Contato",
			semLead: true,
		});
	});

	it("conversa de WhatsApp sem nome não conta como identificada", async () => {
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		const identificados = funil.find((e) => e.chave === "identificados");
		// Contam B, C, D, E e F (nome E contato). Não contam A (WhatsApp sem nome,
		// só com o telefone do canal), G (sem nome) nem H (nome sem contato).
		expect(identificados?.count).toBe(5);
	});

	it("o nome que ficou só na conversa conta — o caso que o predicado perdia", async () => {
		const origens = await performance.computeOrigens(JANELA_DE, JANELA_ATE);
		// E (lead com telefone e nome nulo, `contactName` na conversa) e F (sem
		// lead, `contactName` + `waId`) são a razão desta correção: sem elas, 3.
		expect(origens.reduce((soma, l) => soma + l.identificados, 0)).toBe(5);
	});

	it("o contato conhecido é maior que o identificado — as duas medidas convivem", async () => {
		const origens = await performance.computeOrigens(JANELA_DE, JANELA_ATE);
		const identificados = origens.reduce((soma, l) => soma + l.identificados, 0);
		const comTelefone = origens.reduce((soma, l) => soma + l.comTelefone, 0);
		expect(identificados).toBe(5);
		// `com_contato` mede o alcance da RÉGUA, que lê o lead: contam A, B, C, D e
		// E (têm telefone no lead). F e G não têm lead nenhum e H não tem contato.
		expect(comTelefone).toBe(5);
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
