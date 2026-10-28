import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { conversations, leads, mesaHandoffs } from "@/db/schema";
import type { AnunciarCasoNaMesaArgs } from "@/lib/mesa/dispatch";
import {
	abrirCasoNaMesa,
	linhaDeHandoff,
	linhaFinalDoHandoff,
	nomeDitoNaConversa,
	nomeNaFala,
	RE_DE_PROMESSA,
	semPromessa,
} from "./handoff";

describe("o pedido de humano honra o pedido, sem promessa", () => {
	it("o caso medido (6d647263): as palavras prometidas não passam", () => {
		expect(semPromessa("Um especialista nosso está a caminho para conversar com você.")).toBe(
			false,
		);
		expect(semPromessa("Vou chamar um especialista para conversar com você.")).toBe(false);
	});

	it("pedido do cliente: uma linha, sem promessa, com o nome capturado", () => {
		const linha = linhaDeHandoff({ nome: "Marcos", clientePediu: true });
		expect(linha).toBe("Marcos, abri o caso pra nossa mesa. Um atendente humano assume por aqui.");
		expect(semPromessa(linha)).toBe(true);
		expect(linha.split("\n")).toHaveLength(1);
	});

	it("sugestão do agente (o cliente não pediu) mantém a recomendação", () => {
		const linha = linhaDeHandoff({ nome: null, clientePediu: false });
		expect(linha).toContain("recomendo conversar direto com nosso consultor humano");
	});

	// O tool não pode voltar a ser só uma flag + frase de promessa: ela abre o caso.
	it("o nome dito na fala é FATO: não se pede de novo o que o cliente já disse", () => {
		expect(nomeNaFala("meu nome é Marcos")).toBe("Marcos");
		expect(nomeNaFala("me chamo Ana Clara")).toBe("Ana");
		expect(nomeNaFala("quero falar com uma pessoa")).toBeNull();

		// O tool usa o nome DITO — na fala do turno ou num turno anterior — antes de abrir o
		// caso: capturar, não perguntar de novo.
		const tools = readFileSync(new URL("./tools-livres.ts", import.meta.url).pathname, "utf8");
		expect(tools).toContain("nomeDitoNaConversa({ falaDoTurno: ctx.userText, historico })");
		expect(tools).toMatch(/ctx\.nomeDoCliente \?\? dito\?\.nome/);
	});

	it("o nome dito num turno ANTERIOR não se perde no caminho do caso", () => {
		// O handoff olhava só a fala do turno atual: quem disse o nome e, dois turnos depois,
		// pediu uma pessoa chegava anônimo na mesa (defeito da call de 18:36).
		expect(
			nomeDitoNaConversa({
				falaDoTurno: "quero falar com um atendente",
				historico: [
					{ role: "user", content: "oi, meu nome é Marcos" },
					{ role: "assistant", content: "Prazer, Marcos!" },
				],
			}),
		).toEqual({ nome: "Marcos", fala: "oi, meu nome é Marcos" });
		// A fala do turno manda: é a apresentação mais recente.
		expect(
			nomeDitoNaConversa({
				falaDoTurno: "me chamo Ana",
				historico: [{ role: "user", content: "meu nome é Marcos" }],
			}),
		).toEqual({ nome: "Ana", fala: "me chamo Ana" });
		// Nenhuma apresentação: nada é inventado (e a fala do AGENTE não conta).
		expect(
			nomeDitoNaConversa({
				falaDoTurno: "quero falar com uma pessoa",
				historico: [{ role: "assistant", content: "meu nome é Marcos" }],
			}),
		).toBeNull();
	});

	it("o balão do handoff é UMA linha — a confirmação com prazo não sai", () => {
		const balao = linhaFinalDoHandoff({
			texto:
				"Entendido! Vou abrir a conversa com um especialista para você agora.\n\nCaso aberto! Um especialista vai entrar em contato com você em breve.",
			nome: "Marcos",
			clientePediu: true,
			casoAberto: true,
		});
		expect(balao.split("\n").length).toBeLessThanOrEqual(2);
		expect(semPromessa(balao)).toBe(true);
		expect(balao).toContain("abri o caso pra nossa mesa");
		// Com o nome faltando, a pergunta do nome (o que destrava o caso) continua.
		// Sem lead não há caso: a linha honesta pede o nome, não afirma que abriu.
		const semNome = linhaFinalDoHandoff({
			texto: "Vou abrir o caso.\nQual é o seu nome?",
			nome: null,
			clientePediu: true,
			casoAberto: false,
		});
		// Ordem do líder (27/10, print 16): o pedido de humano é ACEITO primeiro e o balão pede
		// o que falta para o consultor chamar — nome e WhatsApp. "Você já me disse seu nome?"
		// saiu de cena: o agente sabe que o cliente não disse, e isso ignorava o pedido dele.
		expect(semNome).toContain("vou te passar pra um consultor");
		expect(semNome).toContain("como você se chama");
		expect(semNome).toContain("seu número");
		expect(semNome).not.toContain("já me disse");
		expect(semPromessa(semNome)).toBe(true);
		// A aceitação vem ANTES do pedido do dado — nesta ordem.
		expect(semNome.indexOf("consultor")).toBeLessThan(semNome.indexOf("como você se chama"));
	});

	it("com o nome já dito, a transferência o chama pelo nome e pede só o que falta", () => {
		const balao = linhaFinalDoHandoff({
			texto: "Vou te passar para um atendente.",
			nome: "Marcos",
			clientePediu: true,
			casoAberto: false,
		});
		expect(balao).toContain("Claro, Marcos!");
		expect(balao).toContain("pra um consultor");
		expect(balao).toContain("nome e no seu WhatsApp");
		expect(semPromessa(balao)).toBe(true);
	});

	it("`falar_com_humano` abre o caso, e o caso marca handed_off", () => {
		const tool = readFileSync(new URL("./tools-livres.ts", import.meta.url).pathname, "utf8");
		const corpo = tool.slice(
			tool.indexOf("const falar_com_humano"),
			tool.indexOf("const salvar_nome"),
		);
		expect(corpo).toContain("abrirCasoNaMesa(");
		expect(corpo).not.toMatch(/Especialista chamado/);

		const modulo = readFileSync(new URL("./handoff.ts", import.meta.url).pathname, "utf8");
		expect(modulo).toMatch(/set\(\{ status: "handed_off" \}\)/);
	});

	// Botão de confirmação depois de o cliente já ter pedido é burocracia.
	it("o turno escreve a LINHA do handoff, não a prosa do modelo", () => {
		const turno = readFileSync(new URL("./turno-livre.ts", import.meta.url).pathname, "utf8");
		expect(turno).toMatch(/linhaFinalDoHandoff\(\{[^}]*texto: bruto[\s\S]*?casoAberto/);
		// O balão sai pela linha da casa tanto quando o caso foi aberto quanto quando o modelo
		// escreve prosa de promessa antes de abrir.
		expect(turno).toMatch(/handoff:[\s\S]*?RE_DE_PROMESSA\.test\(pendente\)/);
		// Uma linha por turno: a segunda prosa de handoff não vira segunda mensagem.
		expect(turno).toMatch(/linhaDeHandoffEmitida/);

		const tools = readFileSync(new URL("./tools-livres.ts", import.meta.url).pathname, "utf8");
		expect(tools).toMatch(/ctx\.casoAbertoNesteTurno\?\.\(\);/);
		// O aviso de "caso aberto" que sai no balão é o da casa, não a frase do modelo.
		expect(turno).not.toMatch(/Caso aberto!/);
	});

	it("no WhatsApp, pedido do cliente não ganha botão de confirmação", () => {
		const adapter = readFileSync(
			new URL("../../whatsapp/adapter.ts", import.meta.url).pathname,
			"utf8",
		);
		const caso = adapter.slice(
			adapter.indexOf('case "handoff"'),
			adapter.indexOf('case "welcome-categories"'),
		);
		expect(caso).toContain('ev.reason === "pedido do cliente"');
		expect(caso).toContain("flushText()");
	});
});

// L31/N03 — prazo financeiro não é pedido de humano. A regex antiga era só a lista de
// frases: "em até" numa explicação de parcela virava handoff e a fala de cota morria.
describe("promessa de humano exige contexto de humano", () => {
	it("prazo de cota ('em até N meses') não é promessa de atendimento", () => {
		expect(semPromessa("Temos parcelas em até 200 meses, com contemplação em até 12 meses.")).toBe(
			true,
		);
		expect(semPromessa("A contemplação em até 12 meses é uma estimativa, não garantia.")).toBe(
			true,
		);
		// Falar de cota CITANDO o consultor também não é prometer atendimento.
		expect(semPromessa("O consultor te explica melhor: parcelas em até 200 meses.")).toBe(true);
		expect(RE_DE_PROMESSA.test("Cartas de até R$ 80 mil, parcelas em até 200 meses.")).toBe(false);
	});

	it("a promessa de ATENDIMENTO continua barrada", () => {
		expect(RE_DE_PROMESSA.test("Em até 30 minutos um especialista te chama.")).toBe(true);
		expect(RE_DE_PROMESSA.test("Um especialista vai entrar em contato em breve.")).toBe(true);
		expect(RE_DE_PROMESSA.test("Nosso atendente já está falando com você.")).toBe(true);
		// Frase de promessa sem gente nenhuma não é promessa de humano.
		expect(RE_DE_PROMESSA.test("Vamos ver se dá pra reduzir o prazo.")).toBe(false);
	});
});

// L30/N02 — o caso aberto tem que SER VISTO: raia da mesa + dossiê com "Vou atender".
describe("abrirCasoNaMesa anuncia o caso na mesa", () => {
	const conversasCriadas: string[] = [];

	afterEach(async () => {
		for (const id of conversasCriadas.splice(0)) {
			await db.delete(mesaHandoffs).where(eq(mesaHandoffs.conversationId, id));
			await db.delete(leads).where(eq(leads.conversationId, id));
			await db.delete(conversations).where(eq(conversations.id, id));
		}
	});

	async function conversaComLead(args: { nome: string | null; telefone?: string | null }) {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "web", status: "active", isSimulated: true })
			.returning({ id: conversations.id });
		conversasCriadas.push(conv.id);
		const [lead] = await db
			.insert(leads)
			.values({
				conversationId: conv.id,
				name: args.nome,
				phone: args.telefone ?? null,
				isSimulated: true,
			})
			.returning({ id: leads.id });
		return { conversationId: conv.id, leadId: lead.id };
	}

	it("o caso criado é anunciado com o dossiê (e a conversa cala o agente)", async () => {
		const { conversationId, leadId } = await conversaComLead({
			nome: "Marcos",
			telefone: "5511987654321",
		});

		const anuncios: AnunciarCasoNaMesaArgs[] = [];
		const r = await abrirCasoNaMesa(
			{ conversationId, nome: "Marcos", motivo: "cliente pediu uma pessoa" },
			{
				anunciar: async (args) => {
					anuncios.push(args);
				},
			},
		);

		expect(r.ok).toBe(true);
		expect(r.motivo).toBe("caso-aberto");
		expect(r.handoffId).toBeTruthy();
		expect(anuncios).toHaveLength(1);
		expect(anuncios[0].handoffId).toBe(r.handoffId);
		expect(anuncios[0].leadId).toBe(leadId);
		expect(anuncios[0].lead).toMatchObject({ name: "Marcos", phone: "5511987654321" });

		const handoff = await db.query.mesaHandoffs.findFirst({
			where: eq(mesaHandoffs.id, r.handoffId as string),
		});
		expect(handoff?.status).toBe("aberto");
		const [conv] = await db
			.select({ status: conversations.status })
			.from(conversations)
			.where(eq(conversations.id, conversationId));
		expect(conv.status).toBe("handed_off");
	});

	it("sem injeção o anúncio REAL roda: o lead cai na raia da mesa", async () => {
		const { conversationId, leadId } = await conversaComLead({ nome: "Ana" });

		const r = await abrirCasoNaMesa({
			conversationId,
			nome: "Ana",
			motivo: "cliente pediu uma pessoa",
		});

		expect(r.ok).toBe(true);
		const [lead] = await db.select({ stage: leads.stage }).from(leads).where(eq(leads.id, leadId));
		expect(lead.stage).toBe("na_administradora");
	});

	it("sem lead não há caso, e a mesa não é chamada à toa", async () => {
		const [conv] = await db
			.insert(conversations)
			.values({ channel: "web", status: "active", isSimulated: true })
			.returning({ id: conversations.id });
		conversasCriadas.push(conv.id);

		const anuncios: AnunciarCasoNaMesaArgs[] = [];
		const r = await abrirCasoNaMesa(
			{ conversationId: conv.id, nome: null, motivo: "cliente pediu uma pessoa" },
			{
				anunciar: async (args) => {
					anuncios.push(args);
				},
			},
		);

		expect(r.ok).toBe(false);
		expect(r.motivo).toBe("sem-lead");
		expect(anuncios).toHaveLength(0);
	});

	it("o caso que já está na mesa não é anunciado de novo", async () => {
		const { conversationId } = await conversaComLead({ nome: "Marcos" });
		const anuncios: AnunciarCasoNaMesaArgs[] = [];
		const deps = {
			anunciar: async (args: AnunciarCasoNaMesaArgs) => {
				anuncios.push(args);
			},
		};

		const primeiro = await abrirCasoNaMesa(
			{ conversationId, nome: "Marcos", motivo: "pediu humano" },
			deps,
		);
		const segundo = await abrirCasoNaMesa(
			{ conversationId, nome: "Marcos", motivo: "insistiu" },
			deps,
		);

		expect(segundo.ok).toBe(true);
		expect(segundo.handoffId).toBe(primeiro.handoffId);
		expect(anuncios).toHaveLength(1);
	});
});
