// O degrau "Se identificaram" e a unidade de "Propostas", contra Postgres real.
//
// Duas coisas só se provam aqui, e as duas são a razão de o item existir:
//
//   1. **A identificação é do CANAL, não do preenchimento.** Decisão do dono
//      (23/09/2026): *"whatsapp entrou já pode considerar que se identificou, já
//      na web, você tem que considerar quando conseguirmos coletar"*. Conversa de
//      WhatsApp conta (o canal entrega número e perfil); conversa de web conta
//      quando o contato foi coletado. Antes o predicado pedia NOME + contato e,
//      como o pushName cai na conversa, o degrau empatava com "Conversas".
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
// leads daqui entrarem na conta de lá.
const JANELA_DE = new Date("2016-05-01T00:00:00Z");
const JANELA_ATE = new Date("2016-05-31T23:59:59Z");
const DENTRO = new Date("2016-05-15T12:00:00Z");

const UA_GENTE =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

describeIfDb("identificado pelo canal × contato conhecido (integration)", () => {
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

		/**
		 * Uma visita (de gente) + uma conversa, na janela isolada.
		 *
		 * O `waId` NÃO é opcional na conversa de WhatsApp: o canal o preenche no
		 * nascimento (`src/lib/whatsapp/session.ts`). Semear WhatsApp sem `wa_id`
		 * inventa um estado que o sistema não produz — e era o que fazia o caso A
		 * parecer "não identificado" por acidente do fixture, não da regra.
		 */
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

		// A: WhatsApp, o canal entregou o telefone e NÃO há nome em lugar nenhum.
		// Conta: a identificação é do canal, que já trouxe o número.
		await semearConversa({
			canal: "whatsapp",
			nome: null,
			telefone: "+5519900000001",
			waId: "5519900000001",
		});
		// B: web, informou telefone. Conta — conseguimos coletar.
		await semearConversa({ canal: "web", nome: "Cliente Informou", telefone: "+5519900000002" });
		// C: WhatsApp com nome. Conta (o canal já contava).
		await semearConversa({
			canal: "whatsapp",
			nome: "Cliente Do Zap",
			telefone: "+5519900000003",
			waId: "5519900000003",
		});
		// D: identificado e com CINCO propostas na administradora.
		await semearConversa({
			canal: "web",
			nome: "Cliente Com Propostas",
			telefone: "+5519900000004",
			propostas: 5,
		});
		// E: o nome chegou pelo canal e ficou só em `conversations.contactName`, com
		// o `leads.name` nulo. Conta pela conversa (e antes caía fora do predicado).
		await semearConversa({
			canal: "whatsapp",
			nome: null,
			telefone: "+5519900000005",
			nomeNaConversa: "Cliente So Na Conversa",
			waId: "5519900000005",
		});
		// F: nem linha em `leads` — só a conversa com o `waId` do canal. Conta: o
		// `EXISTS` não é a única porta da identificação.
		await semearConversa({
			canal: "whatsapp",
			nome: null,
			telefone: null,
			waId: "5519900000006",
			semLead: true,
		});
		// G: web sem contato e sem lead. NÃO conta — na web só conta o que foi
		// coletado, e não coletamos nada.
		await semearConversa({ canal: "web", nome: null, telefone: null, semLead: true });
		// H: web com NOME na conversa, mas nenhum contato coletado. NÃO conta: o
		// nome do perfil não é coleta, e sem contato não há o que alcançar.
		await semearConversa({
			canal: "web",
			nome: null,
			telefone: null,
			nomeNaConversa: "Cliente Sem Contato",
			semLead: true,
		});
	});

	it("conversa de WhatsApp conta sem nome — o canal já entregou número e perfil", async () => {
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		const identificados = funil.find((e) => e.chave === "identificados");
		// Contam A, B, C, D, E e F. NÃO contam G (web sem contato) nem H (web com
		// nome de perfil e sem contato coletado).
		expect(identificados?.count).toBe(6);
	});

	it("na web, só conta o contato COLETADO — a conversa sem contato fica fora", async () => {
		const origens = await performance.computeOrigens(JANELA_DE, JANELA_ATE);
		expect(origens.reduce((soma, l) => soma + l.identificados, 0)).toBe(6);
	});

	it("a conversa sem linha em `leads` é identificada pelo canal", async () => {
		// F é a razão deste caso: se o predicado voltar a depender de `leads`, ela
		// sai da conta e o total cai para 5.
		const funil = await performance.computeFunilMidia(JANELA_DE, JANELA_ATE);
		const conversas = funil.find((e) => e.chave === "conversas");
		const identificados = funil.find((e) => e.chave === "identificados");
		expect(identificados?.count).toBe(6);
		expect(identificados?.count).toBeLessThanOrEqual(conversas?.count ?? 0);
	});

	it("o contato conhecido mede o alcance da régua — e NÃO é ordem do identificado", async () => {
		const origens = await performance.computeOrigens(JANELA_DE, JANELA_ATE);
		const identificados = origens.reduce((soma, l) => soma + l.identificados, 0);
		const comTelefone = origens.reduce((soma, l) => soma + l.comTelefone, 0);
		expect(identificados).toBe(6);
		// `com_contato` lê o LEAD: contam A, B, C, D e E. F (WhatsApp sem linha em
		// `leads`) é identificada pelo canal e NÃO tem contato no lead — por isso
		// aqui o identificado é MAIOR, e os dois números não são ordem um do outro.
		expect(comTelefone).toBe(5);
		expect(identificados).toBeGreaterThan(comTelefone);
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
