// FALHA DE FERRAMENTA NÃO É HANDOFF.
//
// Medido nos prints de produção de 27/10 (`.orientacao/prints-lgpd/prod/05-depois-do-aceite.png`):
// a `fazer_proposta` falhou (a Bevi não tinha credencial no dev) e o vendedor empurrou o cliente
// para a mesa humana em TRÊS turnos seguidos, com o cliente dizendo "quero essa mesma, bora
// fechar". Duas causas de código:
//
//  1. o texto de erro da tool mandava o modelo "ofereça um especialista humano";
//  2. `falar_com_humano` abria o caso por qualquer motivo — inclusive falha técnica e objeção —
//     mesmo sem o cliente pedir uma pessoa (P5/P7).
//
// Estes testes chamam as tools de VERDADE. As fronteiras externas (banco, mesa, identidade, Bevi,
// histórico) são dubladas; o que se prova é o texto que o modelo lê e o fato de a mesa NÃO ser
// chamada. Remova a correção e eles ficam vermelhos — foi verificado antes de commitar.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const mocks = vi.hoisted(() => ({
	reloadMeta: vi.fn(),
	persistMeta: vi.fn(),
	loadConversationHistory: vi.fn(),
	loadIdentity: vi.fn(),
	getLatestBeviProposal: vi.fn(),
	startContract: vi.fn(),
	listShownOffers: vi.fn(),
	leadFindFirst: vi.fn(),
	abrirCasoNaMesa: vi.fn(),
	saveContactName: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: { query: { leads: { findFirst: mocks.leadFindFirst } } },
}));
vi.mock("@/lib/conversation/meta", () => ({
	reloadMeta: mocks.reloadMeta,
	persistMeta: mocks.persistMeta,
}));
vi.mock("@/lib/conversation/messages", () => ({
	loadConversationHistory: mocks.loadConversationHistory,
}));
vi.mock("@/lib/conversation/identity", () => ({ loadIdentity: mocks.loadIdentity }));
vi.mock("@/lib/bevi/proposal-repo", () => ({ getLatestBeviProposal: mocks.getLatestBeviProposal }));
vi.mock("@/lib/bevi/pessoa", () => ({
	pessoaDaConversa: vi.fn(),
	ultimaPropostaDaPessoa: vi.fn(),
}));
vi.mock("@/lib/bevi/proposal-status", () => ({ checkProposalStatus: vi.fn() }));
vi.mock("@/lib/bevi/fulfillment", () => ({
	fechoJaConcluido: () => false,
	startContract: mocks.startContract,
}));
vi.mock("@/lib/agent/orchestrator/choose-offer", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/agent/orchestrator/choose-offer")>()),
	listShownOffersForConversation: mocks.listShownOffers,
}));
vi.mock("@/lib/leads/contact-capture", () => ({ saveContactName: mocks.saveContactName }));
// Só a abertura do caso é dublada: `clientePedeHumano` é o código REAL (é ele que está sob teste).
vi.mock("@/lib/agent/pi/handoff", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/agent/pi/handoff")>()),
	abrirCasoNaMesa: mocks.abrirCasoNaMesa,
}));

import { clientePedeHumano } from "./handoff";
import { buildToolsLivres, type ContextoDasTools } from "./tools-livres";

const CPF = "11144477735";
const CELULAR = "11987654321";

const CARTA_NA_TELA = {
	groupId: "grupo-canopus-90000",
	administradora: "CANOPUS",
	carta: 90_000,
	parcela: 1_176.39,
	prazoMeses: 96,
};

function ctxDoTurno(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-handoff",
		channel: "web",
		userText: "quero essa mesma, bora fechar",
		nomeDoCliente: "Mário",
		cards: [],
		falasDoFecho: [],
		cartasNaTela: [CARTA_NA_TELA],
		gruposRevelados: new Map(),
		pediuHumano: false,
		estadoDepoisDaBusca: null,
		...over,
	};
}

type ToolChamavel = { execute: (input: unknown, opts: unknown) => Promise<unknown> };

function ferramenta(ctx: ContextoDasTools, nome: "fazer_proposta" | "falar_com_humano") {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	const tool = tools[nome];
	if (!tool) throw new Error(`a tool ${nome} não existe`);
	return tool;
}

async function chamar(
	ctx: ContextoDasTools,
	nome: "fazer_proposta" | "falar_com_humano",
	input: Record<string, unknown>,
): Promise<string> {
	const saida = await ferramenta(ctx, nome).execute(input, {
		toolCallId: "call-1",
		messages: [],
	});
	return String(saida);
}

const falarComHumano = (ctx: ContextoDasTools) =>
	chamar(ctx, "falar_com_humano", { motivo: "a proposta falhou duas vezes" });

beforeEach(() => {
	vi.clearAllMocks();
	mocks.reloadMeta.mockImplementation(
		async () =>
			({ currentCategory: "auto", qualifyAnswers: {} }) as unknown as ConversationMetadata,
	);
	mocks.persistMeta.mockResolvedValue(undefined);
	mocks.loadConversationHistory.mockResolvedValue([]);
	mocks.loadIdentity.mockResolvedValue({ cpf: CPF, celular: CELULAR });
	mocks.getLatestBeviProposal.mockResolvedValue(null);
	mocks.leadFindFirst.mockResolvedValue({ id: "lead-1", phone: CELULAR, name: "Mário" });
	mocks.listShownOffers.mockResolvedValue([
		{
			groupId: CARTA_NA_TELA.groupId,
			administradora: CARTA_NA_TELA.administradora,
			creditValue: CARTA_NA_TELA.carta,
			termMonths: CARTA_NA_TELA.prazoMeses,
			monthlyPayment: CARTA_NA_TELA.parcela,
		},
	]);
	mocks.abrirCasoNaMesa.mockResolvedValue({ ok: true, motivo: "caso-aberto", handoffId: "h-1" });
	mocks.saveContactName.mockResolvedValue({ ok: true, name: "Mário" });
	mocks.startContract.mockResolvedValue({
		offer: {
			administradora: CARTA_NA_TELA.administradora,
			creditValue: CARTA_NA_TELA.carta,
			monthlyPayment: CARTA_NA_TELA.parcela,
			termMonths: CARTA_NA_TELA.prazoMeses,
		},
		proposalId: "prop-1",
	});
});

describe("(1) o texto de erro da proposta não manda o modelo passar o cliente adiante", () => {
	it("falha técnica: manda tentar de novo e proíbe falar_com_humano", async () => {
		mocks.startContract.mockRejectedValue(
			new Error("BeviApiAdapter exige BEVI_API_TOKEN (loja parceira liberada na AGX)"),
		);
		const saida = await chamar(ctxDoTurno(), "fazer_proposta", {
			groupId: CARTA_NA_TELA.groupId,
		});

		expect(saida).toContain("PROBLEMA TÉCNICO");
		// O defeito medido: esta frase existia e o cliente foi para a mesa.
		expect(saida).not.toMatch(/ofere[çc]a um especialista humano/i);
		expect(saida).toContain("Não chame");
		expect(saida).toContain("falar_com_humano");
		// Seguir vendendo é a instrução: tentar de novo com o mesmo id.
		expect(saida).toContain("fazer_proposta");
	});

	it("a revogação do aceite não empurra ninguém para a mesa", async () => {
		// Revogação só existe DEPOIS de um sim (`resolverAceiteLgpd`): sem isso é "ainda não".
		mocks.reloadMeta.mockImplementation(
			async () =>
				({
					currentCategory: "auto",
					qualifyAnswers: {},
					lgpdAceite: { em: "2026-10-27T12:00:00Z", fala: "pode seguir" },
				}) as unknown as ConversationMetadata,
		);
		const saida = await chamar(
			ctxDoTurno({ userText: "não autorizo mais, revogo a autorização" }),
			"fazer_proposta",
			{ groupId: CARTA_NA_TELA.groupId },
		);
		expect(saida).toContain("REVOGOU");
		expect(saida).not.toMatch(/ofere[çc]a falar com um humano/i);
	});
});

describe("(2) a mesa só abre quando o CLIENTE pede uma pessoa", () => {
	it("o caso medido: 'bora fechar' depois da falha não vira handoff", async () => {
		mocks.startContract.mockRejectedValue(new Error("BEVI_API_TOKEN ausente"));
		await chamar(ctxDoTurno(), "fazer_proposta", { groupId: CARTA_NA_TELA.groupId });

		const ctx = ctxDoTurno();
		const saida = await falarComHumano(ctx);

		expect(saida).toContain("Caso NÃO aberto");
		expect(ctx.pediuHumano).toBe(false);
		expect(mocks.abrirCasoNaMesa).not.toHaveBeenCalled();
		// O que o modelo precisa ler para continuar: siga você.
		expect(saida).toMatch(/Siga você/);
	});

	it("objeção ('e se eu não for contemplado') não é pedido de humano", async () => {
		const ctx = ctxDoTurno({ userText: "e se eu não for contemplado?" });
		await falarComHumano(ctx);
		expect(ctx.pediuHumano).toBe(false);
		expect(mocks.abrirCasoNaMesa).not.toHaveBeenCalled();
	});

	it("pedido em turno anterior vale: o caso abre", async () => {
		mocks.loadConversationHistory.mockResolvedValue([
			{ role: "user", content: "prefiro falar com um atendente, por favor" },
			{ role: "assistant", content: "Claro, já chamo." },
		]);
		const ctx = ctxDoTurno({ userText: "oi" });
		const saida = await falarComHumano(ctx);

		expect(saida).toContain("Caso aberto na mesa");
		expect(ctx.pediuHumano).toBe(true);
		expect(mocks.abrirCasoNaMesa).toHaveBeenCalledTimes(1);
	});

	it("pedido no turno atual abre o caso na hora", async () => {
		const ctx = ctxDoTurno({ userText: "quero falar com uma pessoa de verdade" });
		await falarComHumano(ctx);
		expect(ctx.pediuHumano).toBe(true);
		expect(mocks.abrirCasoNaMesa).toHaveBeenCalledTimes(1);
	});
});

describe("(3) clientePedeHumano lê só o pedido explícito de gente", () => {
	it("pedidos de pessoa", () => {
		for (const fala of [
			"quero falar com uma pessoa",
			"me passa para um atendente",
			"preciso falar com o gerente",
			"chama um humano aí",
			"quero atendimento humano",
			"não quero falar com robô",
			"tem como falar com alguém?",
		])
			expect(clientePedeHumano(fala), fala).toBe(true);
	});

	it("conversa normal não é pedido de pessoa", () => {
		for (const fala of [
			"quero essa mesma, bora fechar",
			"e se eu não for contemplado?",
			"quanto fica a parcela de 90 mil?",
			"não entendi o lance",
			"tive um problema ao falar com a administradora",
			"isso é seguro?",
			"",
		])
			expect(clientePedeHumano(fala), fala).toBe(false);
	});
});
