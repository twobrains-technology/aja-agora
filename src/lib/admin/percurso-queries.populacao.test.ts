// A POPULAÇÃO da tela de Percurso — `listarPercurso` contra o banco.
//
// P224/P226: o Percurso é a única tela em que o operador LIGA para a pessoa, e
// ela conta dois fatos que nasceram no funil (`identificou`, `viu_oferta`) e
// mostra o estágio do lead (`l.stage`). A auditoria de 310e avisou que a prova
// existente era a da Exportação — que usa os mesmos fragmentos, mas não é esta
// consulta (P2-a). Aqui a pergunta é a da tela: semeada a pessoa, ela aparece na
// lista do degrau?
//
// Período e campanha próprios (julho/2031) para não encostar na população de
// outro arquivo rodando em paralelo.

import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { artifacts, contacts, conversations, leads, messages, visits } from "@/db/schema";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/variante-da-visita";
import { listarPercurso } from "./percurso-queries";
import type { PassoDoPercurso } from "./percurso-types";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const DE = new Date("2031-07-01T00:00:00.000Z");
const ATE = new Date("2031-07-02T23:59:59.000Z");
const BASE = Date.parse("2031-07-01T12:00:00.000Z");
const MIN = 60_000;
const em = (minutos: number) => new Date(BASE + minutos * MIN);

const CAMPANHA = "campanha-populacao-percurso";
const TELEFONE_DO_QUALIFICADO = "5562931050001";
const TELEFONE_DO_LEGADO = "5562931050002";

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

/** Uma pessoa da campanha — devolve o `visitor_id`, que é o id da linha na tela. */
async function semearPessoa(args: {
	sufixo: string;
	telefoneDoLead?: string;
	estagio?: "novo" | "qualificado";
	contatoId?: string;
	/**
	 * O braço sorteado no metadata. A retenção da oferta pelo card do telefone
	 * só existe em conversa de web COM braço gravado (`ofertaRetidaPeloTelefone`)
	 * — a conversa legada do cenário é exatamente essa.
	 */
	variante?: "A" | "B";
}): Promise<{ visitante: string; conversa: string }> {
	const visitante = `teste-percurso-${args.sufixo}`;
	const [visita] = await db
		.insert(visits)
		.values({
			visitorId: visitante,
			channel: "web",
			userAgent: "Mozilla/5.0 (Macintosh)",
			utmSource: "ig",
			utmCampaign: CAMPANHA,
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

	return { visitante, conversa: conversaId };
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

async function semearTudo(): Promise<{
	cpfIsolado: { visitante: string; conversa: string };
	comTelefone: { visitante: string; conversa: string };
	legadoComOfertaLivre: { visitante: string; conversa: string };
	legadoSoRetido: { visitante: string; conversa: string };
	novaSemCard: { visitante: string; conversa: string };
}> {
	// A: CPF no contato, nada no lead — não é contato alcançável, e o estágio
	// continua `novo`: é o par que P226 vigia.
	const contatoComCpf = await semearContato({ cpf: "52998224725", nome: "Só CPF" });
	const cpfIsolado = await semearPessoa({ sufixo: "cpf", contatoId: contatoComCpf });

	// B: alcançável e qualificado no BANCO.
	const comTelefone = await semearPessoa({
		sufixo: "telefone",
		telefoneDoLead: TELEFONE_DO_QUALIFICADO,
		estagio: "qualificado",
	});

	// C: legado retomado — a oferta do turno 0 saiu sob a trava (card do telefone)
	// e a do turno seguinte foi emitida legível.
	const legadoComOfertaLivre = await semearPessoa({
		sufixo: "legado-livre",
		telefoneDoLead: TELEFONE_DO_LEGADO,
		variante: "A",
	});
	await card(legadoComOfertaLivre.conversa, 1, "simulation_result");
	await card(legadoComOfertaLivre.conversa, 2, "telefone_do_desbloqueio");
	await db.insert(messages).values({
		conversationId: legadoComOfertaLivre.conversa,
		role: "user",
		content: "e aquela do Itaú, como fica?",
		channel: "web",
		createdAt: em(60),
	});
	await card(legadoComOfertaLivre.conversa, 61, "real_offer");

	// D: só a oferta retida — continua sem ter visto oferta.
	const legadoSoRetido = await semearPessoa({ sufixo: "legado-retido", variante: "B" });
	await card(legadoSoRetido.conversa, 1, "simulation_result");
	await card(legadoSoRetido.conversa, 2, "telefone_do_desbloqueio");

	// E: motor livre — oferta legível, sem card do telefone.
	const novaSemCard = await semearPessoa({ sufixo: "nova" });
	await card(novaSemCard.conversa, 1, "real_offer");

	return { cpfIsolado, comTelefone, legadoComOfertaLivre, legadoSoRetido, novaSemCard };
}

/** A leitura da tela no modo "chegou ao menos aqui". */
function lerPasso(passo: PassoDoPercurso) {
	return listarPercurso({ from: DE, to: ATE, passo, modo: "alcancou" });
}

function alcancaram(
	resumo: Array<{ chave: PassoDoPercurso; alcancaram: number }>,
	passo: PassoDoPercurso,
): number {
	const degrau = resumo.find((linha) => linha.chave === passo);
	expect(degrau, `degrau ${passo} não veio no resumo`).toBeDefined();
	return degrau?.alcancaram as number;
}

describeIfDb("a população do Percurso", () => {
	// P224 — "Se identificou" na tela é FATO: quem avançou continua contando, e
	// o CPF isolado não entra.
	it("'Se identificou' lista os dois contatos alcançáveis e exclui o CPF isolado", async () => {
		const semeado = await semearTudo();
		const percurso = await lerPasso("se_identificou");
		const visitantesListados = percurso.pessoas.map((pessoa) => pessoa.visitorId);

		expect(visitantesListados).toContain(semeado.comTelefone.visitante);
		expect(visitantesListados).toContain(semeado.legadoComOfertaLivre.visitante);
		expect(visitantesListados).not.toContain(semeado.cpfIsolado.visitante);
		expect(visitantesListados).toHaveLength(2);
		// A lista aberta e a barra do degrau são a MESMA população.
		expect(percurso.total).toBe(2);
		expect(alcancaram(percurso.resumo, "se_identificou")).toBe(2);
	});

	// P208/P280 pelo lado do Percurso — a oferta retida não conta, a legível sim.
	it("'Viu oferta' conta a oferta legível depois da trava e ignora a retida", async () => {
		const semeado = await semearTudo();
		const percurso = await lerPasso("viu_oferta");
		const visitantesListados = percurso.pessoas.map((pessoa) => pessoa.visitorId);

		expect(visitantesListados).toContain(semeado.legadoComOfertaLivre.visitante);
		expect(visitantesListados).toContain(semeado.novaSemCard.visitante);
		expect(visitantesListados).not.toContain(semeado.legadoSoRetido.visitante);
		expect(visitantesListados).toHaveLength(2);
		expect(alcancaram(percurso.resumo, "viu_oferta")).toBe(2);
	});

	// P226 — o estágio da linha é o do BANCO: quem só deixou CPF continua `novo`,
	// e o qualificado aparece qualificado.
	it("o estágio da linha é o do lead gravado, não o que a tela deduz", async () => {
		const semeado = await semearTudo();
		const percurso = await listarPercurso({ from: DE, to: ATE });
		const linhaDe = (visitante: string) => {
			const linha = percurso.pessoas.find((pessoa) => pessoa.visitorId === visitante);
			expect(linha, `pessoa ${visitante} não veio na lista`).toBeDefined();
			return linha;
		};

		expect(linhaDe(semeado.comTelefone.visitante)?.stageDoLead).toBe("qualificado");
		expect(linhaDe(semeado.cpfIsolado.visitante)?.stageDoLead).toBe("novo");
		expect(linhaDe(semeado.cpfIsolado.visitante)?.perdido).toBe(false);
		expect(percurso.total).toBe(5);
	});
});
