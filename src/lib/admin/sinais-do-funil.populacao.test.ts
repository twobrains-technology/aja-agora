// A POPULAÇÃO que os predicados do funil devolvem — contra o banco de verdade.
//
// O teste de expressão (`sinais-do-funil.test.ts`) prova o texto do SQL; ele não
// prova QUEM entra e quem fica fora, e foi assim que duas trocas de predicado
// passaram verdes mudando o número das telas (re-auditoria 310e, regressão 2 e
// L28/N01). Aqui a pergunta é a do painel: semeada a conversa, ela conta?
//
// O caminho é o REAL — cada consumidor roda a própria consulta (`computeFunilMidia`,
// `exportarPercurso`/`contarPercurso`, `listarVencidas` + `faseDoFunil`,
// `resultadoDoTesteDoTelefone`) —, e a janela é um período vazio do calendário
// (2031) para que a população do teste seja exatamente a semeada aqui.

import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import {
	artifacts,
	contacts,
	conversations,
	leads,
	messages,
	remarketingTouches,
	visits,
} from "@/db/schema";
import { resultadoDoTesteDoTelefone } from "@/lib/chat/resultado-do-teste-do-telefone";
import { CHAVE_DO_TESTE_NO_METADATA } from "@/lib/chat/variante-da-visita";
import { contarPercurso, exportarPercurso } from "@/lib/exportacao/percurso";
import { listarVencidas } from "@/lib/workers/remarketing-cycle";
import { computeFunilMidia, computeOrigens } from "./performance-queries";
import { conversaIdentificada, faseDoFunil } from "./sinais-do-funil";

const HAS_DB = Boolean(process.env.DATABASE_URL) && !process.env.DATABASE_URL?.includes("sentinel");
const describeIfDb = HAS_DB ? describe : describe.skip;

const DE = new Date("2031-03-01T00:00:00.000Z");
const ATE = new Date("2031-03-02T23:59:59.000Z");
const BASE = Date.parse("2031-03-01T12:00:00.000Z");
const MIN = 60_000;
const em = (minutos: number) => new Date(BASE + minutos * MIN);

/** Os telefones semeados não podem colidir com a guarda de telefone da equipe. */
const TELEFONE_DO_B = "5562931010001";
const TELEFONE_DO_F = "5562931010002";
const TELEFONE_DO_C = "5562931010003";
const TELEFONE_DO_D = "5562931010004";

const visitantes: string[] = [];
const conversas: string[] = [];
const contatos: string[] = [];

async function limpar(): Promise<void> {
	if (conversas.length > 0) {
		await db
			.delete(remarketingTouches)
			.where(inArray(remarketingTouches.conversationId, conversas));
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

async function semearContato(dados: {
	phone?: string;
	cpf?: string;
	nome?: string;
}): Promise<string> {
	const [linha] = await db
		.insert(contacts)
		.values({ phone: dados.phone ?? null, cpf: dados.cpf ?? null, name: dados.nome ?? "Pessoa" })
		.returning({ id: contacts.id });
	const id = linha?.id as string;
	contatos.push(id);
	return id;
}

/** Uma conversa WEB do período, com o metadata do teste do telefone quando pedido. */
async function semearConversa(args: {
	sufixo: string;
	variante?: "A" | "B";
	contatoId?: string;
	telefoneDoLead?: string;
	identityCollected?: boolean;
}): Promise<{ visitante: string; conversa: string }> {
	const visitante = `teste-funil2-${args.sufixo}`;
	const [visita] = await db
		.insert(visits)
		.values({
			visitorId: visitante,
			channel: "web",
			userAgent: "Mozilla/5.0 (Macintosh)",
			utmSource: "ig",
			utmCampaign: "campanha-do-teste",
			createdAt: em(0),
		})
		.returning({ id: visits.id });
	visitantes.push(visitante);

	const metadata: Record<string, unknown> = {};
	if (args.variante) metadata[CHAVE_DO_TESTE_NO_METADATA] = { variante: args.variante };
	if (args.identityCollected) metadata.identityCollected = true;

	const [conversa] = await db
		.insert(conversations)
		.values({
			channel: "web",
			status: "active",
			isSimulated: false,
			visitId: visita?.id,
			contactId: args.contatoId ?? null,
			metadata,
			createdAt: em(0),
			updatedAt: em(0),
		})
		.returning({ id: conversations.id });
	const conversaId = conversa?.id as string;
	conversas.push(conversaId);

	if (args.telefoneDoLead) {
		await db.insert(leads).values({
			conversationId: conversaId,
			contactId: args.contatoId ?? null,
			phone: args.telefoneDoLead,
			stage: "novo",
			isSimulated: false,
		});
	}

	return { visitante, conversa: conversaId };
}

/** Uma fala do CLIENTE — é ela que abre turno novo. */
async function falaDoCliente(conversa: string, minutos: number, texto: string): Promise<void> {
	await db.insert(messages).values({
		conversationId: conversa,
		role: "user",
		content: texto,
		channel: "web",
		createdAt: em(minutos),
	});
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
	comTelefoneB: { visitante: string; conversa: string };
}> {
	// ── A: CPF isolado. O contato existe e `identityCollected` está ligado, mas o
	// lead não tem telefone nem e-mail — o time não consegue chamar esta pessoa.
	const contatoComCpf = await semearContato({ cpf: "52998224725", nome: "Só CPF" });
	const cpfIsolado = await semearConversa({
		sufixo: "cpf",
		variante: "A",
		contatoId: contatoComCpf,
		identityCollected: true,
	});
	await falaDoCliente(cpfIsolado.conversa, 0, "quero ver as opções de carro");

	// ── B: contato alcançável — telefone no LEAD.
	const comTelefone = await semearConversa({ sufixo: "telefone", telefoneDoLead: TELEFONE_DO_B });
	await falaDoCliente(comTelefone.conversa, 0, "quero ver as opções de carro");

	// ── C: conversa LEGADA retomada. A oferta do turno 0 saiu sob a trava (o card
	// do telefone fecha o turno), e a oferta do turno seguinte foi emitida legível.
	const legadoComOfertaLivre = await semearConversa({ sufixo: "legado-livre", variante: "A" });
	await falaDoCliente(legadoComOfertaLivre.conversa, 0, "quero ver as opções de carro");
	await card(legadoComOfertaLivre.conversa, 1, "simulation_result");
	// O adapter grava o card do telefone DEPOIS dos cards de oferta do mesmo turno.
	await card(legadoComOfertaLivre.conversa, 2, "telefone_do_desbloqueio");
	await falaDoCliente(legadoComOfertaLivre.conversa, 60, "e aquela do Itaú, como fica?");
	await card(legadoComOfertaLivre.conversa, 61, "real_offer");

	// ── D: conversa legada que só tem a oferta retida — continua não contando.
	const legadoSoRetido = await semearConversa({ sufixo: "legado-retido", variante: "B" });
	await falaDoCliente(legadoSoRetido.conversa, 0, "quero ver as opções de carro");
	await card(legadoSoRetido.conversa, 1, "simulation_result");
	await card(legadoSoRetido.conversa, 2, "telefone_do_desbloqueio");

	// ── E: conversa nova do motor livre — oferta legível, sem card do telefone.
	const novaSemCard = await semearConversa({ sufixo: "nova", variante: "A" });
	await falaDoCliente(novaSemCard.conversa, 0, "quero ver as opções de carro");
	await card(novaSemCard.conversa, 1, "real_offer");

	// ── F: braço B com contato coletado — o outro lado da leitura do A/B.
	const comTelefoneB = await semearConversa({
		sufixo: "telefone-b",
		variante: "B",
		telefoneDoLead: TELEFONE_DO_F,
	});
	await falaDoCliente(comTelefoneB.conversa, 0, "quero ver as opções de carro");

	return {
		cpfIsolado,
		comTelefone,
		legadoComOfertaLivre,
		legadoSoRetido,
		novaSemCard,
		comTelefoneB,
	};
}

describeIfDb("a população do funil no banco", () => {
	// P206/P211/P213/P214 — o degrau "Se identificaram" é contato ALCANÇÁVEL.
	it("Performance: CPF isolado não é identificado; a oferta legível depois da trava conta", async () => {
		await semearTudo();
		const etapas = await computeFunilMidia(DE, ATE);
		const porChave = new Map(etapas.map((etapa) => [etapa.chave, etapa.count]));
		// Identificadas: só B e F (telefone no lead). A tem contato (CPF) e a flag.
		expect(porChave.get("identificados")).toBe(2);
		// Viram oferta: C (legado retido + oferta livre posterior) e E (nova). D não.
		expect(porChave.get("viram_oferta")).toBe(2);
	});

	// P053/P054/P242 — o arquivo e o cartão de contagem falam da MESMA população.
	it("Exportação: a escada exporta a população dos dois fatos, e a contagem bate com o arquivo", async () => {
		const semeado = await semearTudo();

		const identificados = await exportarPercurso({
			de: DE,
			ate: ATE,
			passo: "se_identificou",
			mascarar: false,
		});
		const visitantesIdentificados = identificados.map((linha) => linha.visitanteId);
		expect(visitantesIdentificados).toContain(semeado.comTelefone.visitante);
		expect(visitantesIdentificados).toContain(semeado.comTelefoneB.visitante);
		expect(visitantesIdentificados).not.toContain(semeado.cpfIsolado.visitante);
		expect(visitantesIdentificados).toHaveLength(2);

		const viramOferta = await exportarPercurso({
			de: DE,
			ate: ATE,
			passo: "viu_oferta",
			mascarar: false,
		});
		const visitantesComOferta = viramOferta.map((linha) => linha.visitanteId);
		expect(visitantesComOferta).toContain(semeado.legadoComOfertaLivre.visitante);
		expect(visitantesComOferta).toContain(semeado.novaSemCard.visitante);
		expect(visitantesComOferta).not.toContain(semeado.legadoSoRetido.visitante);
		expect(visitantesComOferta).toHaveLength(2);

		const contagem = await contarPercurso({ de: DE, ate: ATE, passo: "viu_oferta" });
		expect(contagem.pessoas).toBe(viramOferta.length);
	});

	// P245 — a macro-fase da régua é FATO da conversa: a legada retomada não pode
	// receber a mensagem da fase anterior.
	it("Remarketing: a macro-fase da conversa legada retomada é 'viu_oferta'", async () => {
		const semeado = await semearTudo();
		const contatoC = await semearContato({ phone: TELEFONE_DO_C, nome: "Retomada C" });
		const contatoD = await semearContato({ phone: TELEFONE_DO_D, nome: "Retomada D" });
		for (const [conversa, contato] of [
			[semeado.legadoComOfertaLivre.conversa, contatoC],
			[semeado.legadoSoRetido.conversa, contatoD],
		] as const) {
			await db.insert(remarketingTouches).values({
				conversationId: conversa,
				contactId: contato,
				objetivo: "carro",
				step: 1,
				status: "ATIVO",
				nextTouchAt: em(120),
				ultimoToqueEm: em(60),
				touches30d: 1,
			});
		}

		const linhas = await listarVencidas(em(180));
		const faseDe = (conversa: string) => {
			const linha = linhas.find((l) => l.conversationId === conversa);
			expect(linha, `conversa ${conversa} não veio na leitura da régua`).toBeDefined();
			return faseDoFunil({ viuOferta: linha?.viuOferta === true, teveProposta: false });
		};
		expect(faseDe(semeado.legadoComOfertaLivre.conversa)).toBe("viu_oferta");
		expect(faseDe(semeado.legadoSoRetido.conversa)).toBe("inicio");
	});

	// P048/P061 — o filtro `?identificavel=true` da tela de Conversas e do quadro de
	// leads empurra ESTE predicado para o WHERE. Sobre a população, ele responde o
	// que o degrau responde.
	it("o predicado compartilhado dos filtros deixa o CPF isolado de fora", async () => {
		const semeado = await semearTudo();
		const { rows } = await db.execute<{ id: string }>(sql`
      SELECT c.id::text AS id FROM conversations c
       WHERE c.id IN (${semeado.cpfIsolado.conversa}, ${semeado.comTelefone.conversa})
         AND ${conversaIdentificada(sql`c`)}
    `);
		expect(rows.map((linha) => linha.id)).toEqual([semeado.comTelefone.conversa]);
	});

	// P213/P228/P230 — a tabela por origem e a tela de Campanhas contam com o MESMO
	// fragmento (`contagensDoFunil`); a população não pode diferir da do funil.
	it("Origens: o degrau por origem conta a mesma população identificada do funil", async () => {
		await semearTudo();
		const origens = await computeOrigens(DE, ATE);
		expect(origens).toHaveLength(1);
		expect(origens[0]?.identificados).toBe(2);
	});

	// P241 — o resultado do A/B: "telefone" é contato coletado (CPF isolado não é),
	// e "comparação" conta a oferta que o cliente pôde ler.
	it("A/B: CPF isolado não vira 'telefone' e a oferta legível conta como comparação", async () => {
		await semearTudo();
		const resultado = await resultadoDoTesteDoTelefone(DE, ATE);
		const bracoA = resultado.find((linha) => linha.variante === "A");
		const bracoB = resultado.find((linha) => linha.variante === "B");

		// A: CPF isolado (não conta telefone) + legado retomado (conta) + nova (conta).
		expect(bracoA?.visitas).toBe(3);
		expect(bracoA?.telefones).toBe(0);
		expect(bracoA?.naComparacao).toBe(2);
		// B: legado só retido (não conta) + braço B com telefone coletado.
		expect(bracoB?.visitas).toBe(2);
		expect(bracoB?.telefones).toBe(1);
		expect(bracoB?.naComparacao).toBe(0);
	});
});
