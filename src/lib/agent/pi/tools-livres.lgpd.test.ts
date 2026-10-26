// REVOGAÇÃO DO ACEITE NÃO É "AINDA NÃO RESPONDEU".
//
// `resolverAceiteLgpd` distingue três motivos de bloqueio (`lgpd.ts:206-210`):
// `aviso-nao-dado`, `falta-o-aceite` e `aceite-revogado`. O `fazer_proposta`
// respondia a revogação com a fala do silêncio — "o cliente ainda não respondeu
// o aviso… Peça o aceite em uma frase" — logo depois de o cliente dizer "não
// autorizo". O bloqueio (não gerar proposta) estava certo; a fala mandava o
// modelo insistir contra a própria fala do cliente.
//
// Estes testes chamam a tool de verdade (`buildToolsLivres(...).fazer_proposta`)
// com o `resolverAceiteLgpd` REAL: o que se prova é o texto que o modelo lê e o
// fato de a Bevi não ser chamada — não a expressão que decidiu o ramo. As
// fronteiras externas (banco, meta, histórico, identidade, Bevi) são dubladas.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { AVISO_LGPD } from "@/lib/agent/pi/lgpd";

const mocks = vi.hoisted(() => ({
	reloadMeta: vi.fn(),
	persistMeta: vi.fn(),
	loadConversationHistory: vi.fn(),
	loadIdentity: vi.fn(),
	getLatestBeviProposal: vi.fn(),
	startContract: vi.fn(),
	listShownOffers: vi.fn(),
	leadFindFirst: vi.fn(),
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

import { buildToolsLivres, type ContextoDasTools } from "./tools-livres";

const CPF = "11144477735";
const CELULAR = "11987654321";

const CARTA_NA_TELA = {
	groupId: "grupo-itau-92902",
	administradora: "ITAÚ",
	carta: 92_902,
	parcela: 1_180,
	prazoMeses: 100,
};

function ctxDoTurno(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-lgpd",
		channel: "web",
		userText: "pode fechar",
		nomeDoCliente: null,
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

/** O retorno da tool é o texto que o MODELO lê no próximo passo. */
async function falarComAFerramenta(ctx: ContextoDasTools): Promise<string> {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	const tool = tools.fazer_proposta;
	if (!tool) throw new Error("a tool fazer_proposta não existe");
	const saida = await tool.execute(
		{ groupId: CARTA_NA_TELA.groupId, aceiteLgpd: true },
		{ toolCallId: "call-1", messages: [] },
	);
	return String(saida);
}

beforeEach(() => {
	// As chamadas de um caso não podem vazar para o seguinte: há teste que afirma
	// `startContract` chamado e teste que afirma o contrário.
	vi.clearAllMocks();
	mocks.reloadMeta.mockImplementation(
		async () =>
			({ currentCategory: "auto", qualifyAnswers: {} }) as unknown as ConversationMetadata,
	);
	mocks.persistMeta.mockResolvedValue(undefined);
	mocks.loadConversationHistory.mockResolvedValue([]);
	mocks.loadIdentity.mockResolvedValue({ cpf: CPF, celular: CELULAR });
	mocks.getLatestBeviProposal.mockResolvedValue(null);
	mocks.leadFindFirst.mockResolvedValue({ id: "lead-1", phone: CELULAR, name: null });
	mocks.listShownOffers.mockResolvedValue([
		{
			groupId: CARTA_NA_TELA.groupId,
			administradora: CARTA_NA_TELA.administradora,
			creditValue: CARTA_NA_TELA.carta,
			termMonths: CARTA_NA_TELA.prazoMeses,
			monthlyPayment: CARTA_NA_TELA.parcela,
		},
	]);
	mocks.startContract.mockResolvedValue({
		proposalId: "proposta-1",
		requestedCreditValue: CARTA_NA_TELA.carta,
		offer: {
			ofertaId: "oferta-1",
			administradora: CARTA_NA_TELA.administradora,
			grupo: "grupo-itau-real",
			category: "auto",
			creditValue: CARTA_NA_TELA.carta,
			monthlyPayment: CARTA_NA_TELA.parcela,
			termMonths: CARTA_NA_TELA.prazoMeses,
		},
	});
});

describe("fazer_proposta — as três recusas de LGPD dizem coisas diferentes ao modelo", () => {
	it("sem aviso na conversa: manda DAR o aviso", async () => {
		const ctx = ctxDoTurno({ userText: "pode fechar" });
		const retorno = await falarComAFerramenta(ctx);

		expect(retorno).toContain("o aviso da LGPD ainda não foi dado");
		expect(retorno).not.toContain("não respondeu o aviso");
		expect(mocks.startContract).not.toHaveBeenCalled();
		expect(ctx.cards.some((c) => c.type === "real_offer")).toBe(false);
	});

	it("aviso dado e cliente calado: pede o aceite em uma frase", async () => {
		mocks.loadConversationHistory.mockResolvedValue([{ role: "assistant", content: AVISO_LGPD }]);
		const ctx = ctxDoTurno({ userText: "deixa eu ver com a esposa" });
		const retorno = await falarComAFerramenta(ctx);

		expect(retorno).toContain("ainda não respondeu o aviso");
		expect(retorno).toContain("Peça o aceite");
		expect(retorno).not.toContain("REVOGOU");
		expect(mocks.startContract).not.toHaveBeenCalled();
	});

	it("cliente REVOGOU depois do sim: não insiste, oferece humano e não gera proposta", async () => {
		mocks.loadConversationHistory.mockResolvedValue([
			{ role: "assistant", content: AVISO_LGPD },
			{ role: "user", content: "pode usar meus dados" },
		]);
		const ctx = ctxDoTurno({ userText: "não autorizo mais, quero falar com uma pessoa" });
		const retorno = await falarComAFerramenta(ctx);

		expect(retorno).toContain("REVOGOU");
		expect(retorno).toContain("humano");
		expect(retorno).not.toContain("Peça o aceite");
		expect(retorno).not.toContain("não respondeu o aviso");
		expect(mocks.startContract).not.toHaveBeenCalled();
		expect(ctx.cards.some((c) => c.type === "real_offer")).toBe(false);
	});

	// A recusa da oferta e a revogação podem estar na MESMA frase. A recusa do prazo
	// não pode engolir o "não autorizo" que vem ao lado dela.
	it("recusa do prazo não engole a revogação na mesma frase: não gera proposta", async () => {
		mocks.loadConversationHistory.mockResolvedValue([
			{ role: "assistant", content: AVISO_LGPD },
			{ role: "user", content: "pode usar meus dados" },
		]);
		const ctx = ctxDoTurno({ userText: "Não aceito o prazo, não autorizo consultar meu CPF." });
		const retorno = await falarComAFerramenta(ctx);

		expect(retorno).toContain("REVOGOU");
		expect(retorno).not.toContain("Peça o aceite");
		expect(mocks.startContract).not.toHaveBeenCalled();
		expect(ctx.cards.some((c) => c.type === "real_offer")).toBe(false);
	});

	it("recusar o prazo sozinho não revoga: o fechamento segue", async () => {
		mocks.loadConversationHistory.mockResolvedValue([
			{ role: "assistant", content: AVISO_LGPD },
			{ role: "user", content: "pode usar meus dados" },
		]);
		const ctx = ctxDoTurno({ userText: "Não aceito o prazo." });
		const retorno = await falarComAFerramenta(ctx);

		expect(retorno).not.toContain("REVOGOU");
		expect(mocks.startContract).toHaveBeenCalledTimes(1);
	});

	it("a revogação chegando só pelo histórico (aceite gravado antes) também não insiste", async () => {
		mocks.reloadMeta.mockImplementation(
			async () =>
				({
					currentCategory: "auto",
					qualifyAnswers: {},
					lgpdAceite: { em: "2026-10-20T12:00:00.000Z", fala: "pode usar" },
				}) as unknown as ConversationMetadata,
		);
		mocks.loadConversationHistory.mockResolvedValue([
			{ role: "assistant", content: AVISO_LGPD },
			{ role: "user", content: "não quero mais que vocês consultem meu CPF" },
		]);
		const ctx = ctxDoTurno({ userText: "não quero mais que vocês consultem meu CPF" });
		const retorno = await falarComAFerramenta(ctx);

		expect(retorno).toContain("REVOGOU");
		expect(retorno).not.toContain("Peça o aceite");
		expect(mocks.startContract).not.toHaveBeenCalled();
	});
});
