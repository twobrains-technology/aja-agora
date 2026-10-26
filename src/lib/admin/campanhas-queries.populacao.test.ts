// A POPULAÇÃO da tela de Campanhas — `computeCampanhas` contra o banco.
//
// P228/P229/P230: a linha da campanha, o rodapé e o recorte por CRIATIVO leem o
// fragmento único do funil (`contagensDoFunil`). Se o degrau "identificados"
// mudar de predicado em `sinais-do-funil.ts`, os três mudam juntos — e foi
// exatamente esse o defeito de 310e, que só o texto do SQL não pegava. Aqui a
// pergunta é a do operador: semeada a conversa com criativo X, onde ela aparece?
//
// Período e campanha próprios (maio/2031, "campanha-populacao-campanhas") para
// que a população do teste não encoste na de outro arquivo rodando em paralelo.

import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { artifacts, contacts, conversations, leads, messages, visits } from "@/db/schema";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/variante-da-visita";
import { computeCampanhas } from "./campanhas-queries";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const DE = new Date("2031-05-01T00:00:00.000Z");
const ATE = new Date("2031-05-02T23:59:59.000Z");
const BASE = Date.parse("2031-05-01T12:00:00.000Z");
const MIN = 60_000;
const em = (minutos: number) => new Date(BASE + minutos * MIN);

const CAMPANHA = "campanha-populacao-campanhas";
const TELEFONE_DO_QUALIFICADO = "5562931040001";
const TELEFONE_DO_LEGADO = "5562931040002";

const visitantes: string[] = [];
const conversas: string[] = [];
const contatos: string[] = [];

async function limpar(): Promise<void> {
	if (conversas.length > 0) {
		await db.delete(messages).where(inArray(messages.conversationId, conversas));
		await db.delete(leads).where(inArray(leads.conversationId, conversas));
		await db.delete(conversations).where(inArray(conversations.id, conversas));
	}
	if (visitantes.length > 0) await db.delete(visits).where(inArray(visits.visitorId, visitantes));
	if (contatos.length > 0) await db.delete(contacts).where(inArray(contacts.id, contatos));
	conversas.length = 0;
	visitantes.length = 0;
	contatos.length = 0;
}

beforeEach(limpar);
afterAll(limpar);

async function semearContato(dados: { cpf?: string; nome: string }): Promise<string> {
	const [linha] = await db
		.insert(contacts)
		.values({ cpf: dados.cpf ?? null, name: dados.nome })
		.returning({ id: contacts.id });
	const id = linha?.id as string;
	contatos.push(id);
	return id;
}

/** Uma conversa da campanha, com o criativo (`utm_content`) que a trouxe. */
async function semearConversa(args: {
	sufixo: string;
	criativo: string;
	telefoneDoLead?: string;
	estagio?: "novo" | "qualificado";
	contatoId?: string;
	/**
	 * O braço sorteado no metadata — o que faz a conversa legada ser lida como
	 * "reveal retido pelo card do telefone" (`ofertaRetidaPeloTelefone`).
	 */
	variante?: "A" | "B";
}): Promise<string> {
	const visitante = `teste-campanhas-${args.sufixo}`;
	const [visita] = await db
		.insert(visits)
		.values({
			visitorId: visitante,
			channel: "web",
			userAgent: "Mozilla/5.0 (Macintosh)",
			utmSource: "ig",
			utmCampaign: CAMPANHA,
			utmContent: args.criativo,
			createdAt: em(0),
		})
		.returning({ id: visits.id });
	visitantes.push(visitante);

	const [conversa] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: "active",
			isSimulated: false,
			visitId: visita?.id,
			contactId: args.contatoId ?? null,
			metadata: args.variante ? { [CHAVE_DO_TESTE_NO_METADATA]: { variante: args.variante } } : {},
			createdAt: em(0),
			updatedAt: em(0),
		})
		.returning({ id: conversations.id });
	const conversaId = conversa?.id as string;
	conversas.push(conversaId);

	await db.insert(messages).values({
		conversationId: conversaId,
		role: "user",
		content: "quero ver as opções de carro",
		channel: "web",
		createdAt: em(0),
	});

	await db.insert(leads).values({
		conversationId: conversaId,
		contactId: args.contatoId ?? null,
		phone: args.telefoneDoLead ?? null,
		stage: args.estagio ?? "novo",
		isSimulated: false,
		createdAt: em(0),
		updatedAt: em(0),
	});

	return conversaId;
}

/** Um card persistido — cada artifact nasce numa mensagem própria, como em produção. */
async function card(conversa: string, minutos: number, tipo: string): Promise<void> {
	const [mensagem] = await db
		.insert(messages)
		.values({
			conversationId: conversa,
			role: "assistant",
			content: `[card: ${tipo}]`,
			channel: "web",
			createdAt: em(minutos),
		})
		.returning({ id: messages.id });
	await db.insert(artifacts).values({
		messageId: mensagem?.id as string,
		type: tipo,
		payload: {},
		createdAt: em(minutos),
	});
}

async function semearTudo(): Promise<{ comTelefone: string; legadoComOfertaLivre: string }> {
	// A: CPF isolado — contato existe, lead sem telefone nem e-mail.
	const contatoComCpf = await semearContato({ cpf: "52998224725", nome: "Só CPF" });
	await semearConversa({ sufixo: "cpf", criativo: "criativo-cpf", contatoId: contatoComCpf });

	// B: contato ALCANÇÁVEL e qualificado.
	const comTelefone = await semearConversa({
		sufixo: "telefone",
		criativo: "criativo-telefone",
		telefoneDoLead: TELEFONE_DO_QUALIFICADO,
		estagio: "qualificado",
	});

	// C: legado retomado — oferta do turno 0 saiu sob a trava (card do telefone) e
	// a do turno seguinte, legível. O telefone do lead é o que o torna identificado.
	const legadoComOfertaLivre = await semearConversa({
		sufixo: "legado-livre",
		criativo: "criativo-oferta",
		telefoneDoLead: TELEFONE_DO_LEGADO,
		variante: "A",
	});
	await card(legadoComOfertaLivre, 1, "simulation_result");
	await card(legadoComOfertaLivre, 2, "telefone_do_desbloqueio");
	await db.insert(messages).values({
		conversationId: legadoComOfertaLivre,
		role: "user",
		content: "e aquela do Itaú, como fica?",
		channel: "web",
		createdAt: em(60),
	});
	await card(legadoComOfertaLivre, 61, "real_offer");

	// D e E: sem contato alcançável — não podem inflar o degrau de identificados.
	await semearConversa({ sufixo: "retido", criativo: "criativo-retido", variante: "B" });
	await semearConversa({ sufixo: "novo", criativo: "criativo-novo" });

	return { comTelefone, legadoComOfertaLivre };
}

describeIfDb("a população da tela de Campanhas", () => {
	// P228/P229 — o funil da campanha e o rodapé contam a mesma população do
	// degrau central: identificado é contato alcançável, não CPF no contato.
	it("a linha da campanha conta 5 conversas e só os 2 contatos alcançáveis como identificados", async () => {
		await semearTudo();
		const resposta = await computeCampanhas(DE, ATE);
		const linha = resposta.linhas.find((l) => l.chave === CAMPANHA);
		expect(linha, "a campanha semeada não veio na tela").toBeDefined();

		expect(linha?.visitas).toBe(5);
		expect(linha?.conversas).toBe(5);
		// B (telefone no lead) e C (telefone no lead). A tem CPF e ficou fora.
		expect(linha?.identificados).toBe(2);
		expect(linha?.comTelefone).toBe(2);
		// `qualificado` é estágio do BANCO, e o CPF isolado continua em `novo`.
		expect(linha?.qualificados).toBe(1);

		// O rodapé ("Leads no CRM") soma as MESMAS linhas — e a linha de
		// reconciliação não pode aparecer: todas as conversas têm visita.
		expect(resposta.totais.leadsCrm).toBe(2);
		expect(resposta.totais.qualificados).toBe(1);
		expect(resposta.totais.conversas).toBe(5);
		expect(resposta.linhas.some((l) => l.semOrigemConhecida)).toBe(false);
	});

	// P230 — o recorte por criativo herda o mesmo fragmento: o criativo do CPF
	// isolado zera, e os dois criativos alcançáveis contam um cada.
	it("cada criativo conta a população que ele mesmo trouxe", async () => {
		await semearTudo();
		const resposta = await computeCampanhas(DE, ATE);
		const linha = resposta.linhas.find((l) => l.chave === CAMPANHA);
		const criativo = (chave: string) => linha?.criativos.find((c) => c.chave === chave);

		expect((linha?.criativos ?? []).map((c) => c.chave).sort()).toEqual([
			"criativo-cpf",
			"criativo-novo",
			"criativo-oferta",
			"criativo-retido",
			"criativo-telefone",
		]);
		expect(criativo("criativo-telefone")).toMatchObject({
			visitas: 1,
			conversas: 1,
			identificados: 1,
		});
		expect(criativo("criativo-oferta")).toMatchObject({
			visitas: 1,
			conversas: 1,
			identificados: 1,
		});
		expect(criativo("criativo-cpf")).toMatchObject({ visitas: 1, conversas: 1, identificados: 0 });
		expect(criativo("criativo-retido")).toMatchObject({ identificados: 0 });
		expect(criativo("criativo-novo")).toMatchObject({ identificados: 0 });
		// A soma dos criativos é a população que o funil da campanha contou.
		const identificadosPorCriativo = (linha?.criativos ?? []).reduce(
			(soma, c) => soma + c.identificados,
			0,
		);
		expect(identificadosPorCriativo).toBe(linha?.identificados);
	});
});
