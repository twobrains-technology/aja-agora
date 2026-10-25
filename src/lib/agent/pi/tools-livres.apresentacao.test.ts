// O QUE O CLIENTE VÊ NO FECHO — pelo caminho real da tool `fazer_proposta`.
//
// P144/P268 (L14): a `main` chamava `realOfferPresentation(result, opts)` com a
// oferta que o cliente VIU (`meta.recommendedOffer`), o lance declarado e o
// contexto do lance embutido. O vendedor livre passou a chamar sem opts, e a
// carta real que volta com OUTRA parcela/prazo deixou de avisar — o cliente diz
// sim olhando 1.180 em 100 meses e recebe 1.450. O mesmo `opts` habilita a frase
// de posição factual do lance (FIX-40) e a marca de carta maior por embutido.
//
// Os testes chamam a tool de verdade (`buildToolsLivres(...).fazer_proposta`),
// com as fronteiras externas dubladas: o que se prova é o PAYLOAD do card que
// sai para o cliente, não a expressão que o montou.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";

const mocks = vi.hoisted(() => ({
	reloadMeta: vi.fn(),
	persistMeta: vi.fn(),
	loadConversationHistory: vi.fn(),
	resolverAceiteLgpd: vi.fn(),
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
vi.mock("@/lib/agent/pi/lgpd", () => ({ resolverAceiteLgpd: mocks.resolverAceiteLgpd }));
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

/** A carta que estava NA TELA quando o cliente disse sim: parcela de 1.180 em
 * 100 meses. É o número que ele aprovou. */
const CARTA_NA_TELA = {
	groupId: "grupo-itau-92902",
	administradora: "ITAÚ",
	carta: 92_902,
	parcela: 1_180,
	prazoMeses: 100,
};

/** A carta que a administradora devolveu no fechamento — parcela MAIOR que a
 * vista (o grupo disponível não é o simulado). */
function ofertaReal(over: Record<string, unknown> = {}) {
	return {
		ofertaId: "oferta-1",
		administradora: "ITAÚ",
		grupo: "grupo-itau-real",
		category: "auto",
		creditValue: 92_902,
		monthlyPayment: 1_450,
		termMonths: 100,
		tipoOferta: "SPECIAL_OFFER",
		...over,
	};
}

function metaDaConversa(over: Partial<ConversationMetadata> = {}): ConversationMetadata {
	return {
		currentCategory: "auto",
		qualifyAnswers: { creditMax: 92_902 },
		...over,
	} as unknown as ConversationMetadata;
}

function ctxDoTurno(over: Partial<ContextoDasTools> = {}): ContextoDasTools {
	return {
		conversationId: "conv-oferta",
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

function fechar(ctx: ContextoDasTools): Promise<unknown> {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	const tool = tools.fazer_proposta;
	if (!tool) throw new Error("a tool fazer_proposta não existe");
	return tool.execute(
		{ groupId: CARTA_NA_TELA.groupId, aceiteLgpd: true },
		{
			toolCallId: "call-1",
			messages: [],
		},
	);
}

function payloadDoRealOffer(ctx: ContextoDasTools): Record<string, unknown> {
	const card = ctx.cards.find((c) => c.type === "real_offer");
	if (!card) throw new Error("o card real_offer não foi emitido");
	return card.payload;
}

beforeEach(() => {
	mocks.reloadMeta.mockImplementation(async () => metaDaConversa());
	mocks.persistMeta.mockResolvedValue(undefined);
	mocks.loadConversationHistory.mockResolvedValue([]);
	mocks.resolverAceiteLgpd.mockReturnValue({ ok: true });
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
		offer: ofertaReal(),
	});
});

describe("P268/L14 — a carta real que muda a PARCELA avisa o cliente", () => {
	it("a oferta real de 1.450 depois de ele aprovar 1.180 leva `parcelaVista`", async () => {
		const ctx = ctxDoTurno();
		await fechar(ctx);

		const payload = payloadDoRealOffer(ctx);
		expect(payload.monthlyPayment).toBe(1_450);
		expect(payload.parcelaVista).toBe(1_180);
	});

	it("parcela igual à vista não inventa aviso", async () => {
		mocks.startContract.mockResolvedValue({
			proposalId: "proposta-1",
			requestedCreditValue: CARTA_NA_TELA.carta,
			offer: ofertaReal({ monthlyPayment: CARTA_NA_TELA.parcela }),
		});
		const ctx = ctxDoTurno();
		await fechar(ctx);

		expect(payloadDoRealOffer(ctx)).not.toHaveProperty("parcelaVista");
	});

	it("a carta real que muda o PRAZO leva `prazoVisto`", async () => {
		mocks.startContract.mockResolvedValue({
			proposalId: "proposta-1",
			requestedCreditValue: CARTA_NA_TELA.carta,
			offer: ofertaReal({ monthlyPayment: CARTA_NA_TELA.parcela, termMonths: 120 }),
		});
		const ctx = ctxDoTurno();
		await fechar(ctx);

		expect(payloadDoRealOffer(ctx).prazoVisto).toBe(100);
	});
});

describe("FIX-40 — a posição factual do lance declarado volta a ser dita", () => {
	it("lance declarado abaixo do lance médio do grupo vira frase no fecho", async () => {
		mocks.reloadMeta.mockImplementation(async () =>
			metaDaConversa({ qualifyAnswers: { creditMax: 92_902, lanceValue: 30_000 } }),
		);
		mocks.startContract.mockResolvedValue({
			proposalId: "proposta-1",
			requestedCreditValue: CARTA_NA_TELA.carta,
			offer: ofertaReal({ avgBidValue: 45_000 }),
		});
		const ctx = ctxDoTurno();
		await fechar(ctx);

		expect(ctx.falasDoFecho.join(" ")).toContain("abaixo do lance médio");
	});

	it("sem lance declarado não há frase de posição (nada de número sem fonte)", async () => {
		mocks.startContract.mockResolvedValue({
			proposalId: "proposta-1",
			requestedCreditValue: CARTA_NA_TELA.carta,
			offer: ofertaReal({ avgBidValue: 45_000 }),
		});
		const ctx = ctxDoTurno();
		await fechar(ctx);

		expect(ctx.falasDoFecho.join(" ")).not.toContain("Sobre o seu lance");
	});
});

describe("P268/L14 — o contexto do lance embutido chega ao card", () => {
	it("busca deste turno com lance embutido marca `cartaMaiorPorEmbutido`", async () => {
		const ctx = ctxDoTurno({
			estadoDepoisDaBusca: {
				categoria: "auto",
				creditMax: 119_000,
				valorDoBemAlvo: 92_902,
				lanceEmbutido: true,
			},
		});
		await fechar(ctx);

		expect(payloadDoRealOffer(ctx).cartaMaiorPorEmbutido).toBe(true);
	});

	it("embutido declarado na qualificação (meta) também marca o card", async () => {
		mocks.reloadMeta.mockImplementation(async () =>
			metaDaConversa({ qualifyAnswers: { creditMax: 92_902, lanceEmbutido: true } }),
		);
		const ctx = ctxDoTurno();
		await fechar(ctx);

		expect(payloadDoRealOffer(ctx).cartaMaiorPorEmbutido).toBe(true);
	});
});
