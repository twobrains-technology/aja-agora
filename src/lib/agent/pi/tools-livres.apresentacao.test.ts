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

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationMetadata } from "@/lib/agent/personas";
import type { RealOfferPayload } from "@/lib/chat/types";

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
	/** As escritas de `saveContactName` (`conversations.contactName` e
	 * `leads.name`) — o banco é dublado, a régua do nome é a de verdade. */
	update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
}));

vi.mock("@/db", () => ({
	db: { update: mocks.update, query: { leads: { findFirst: mocks.leadFindFirst } } },
}));
vi.mock("@/lib/contacts/sincronizar-nome", () => ({
	sincronizarNomeDoContato: vi.fn(async () => null),
}));
vi.mock("@/lib/conversions/registry", () => ({ registrarLeadIdentificado: vi.fn() }));
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
// O DOCUMENTO de verdade, não a expressão que o monta: `real_offer` chega ao
// cliente por `artifact-renderer.tsx:82` → `ProposalDoc`. O contexto do chat só
// existe na árvore React (os CTAs do documento); para o cabeçalho, basta ele.
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready", messages: [] }),
}));

import { ProposalDoc } from "@/components/chat/artifacts/proposal-doc";
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

/** A tool do nome no MESMO contexto de tools do fechamento — é assim no turno
 * real: `buildToolsLivres(ctx)` uma vez, e o modelo chama as duas em sequência. */
function chamarSalvarNome(ctx: ContextoDasTools, nome: string): Promise<unknown> {
	const tools = buildToolsLivres(ctx) as unknown as Record<string, ToolChamavel>;
	const tool = tools.salvar_nome;
	if (!tool) throw new Error("a tool salvar_nome não existe");
	return tool.execute({ nome }, { toolCallId: "call-0", messages: [] });
}

function payloadDoRealOffer(ctx: ContextoDasTools): Record<string, unknown> {
	const card = ctx.cards.find((c) => c.type === "real_offer");
	if (!card) throw new Error("o card real_offer não foi emitido");
	return card.payload;
}

/** O cabeçalho do documento que o cliente recebe (`ProposalDoc`) com o payload
 * que a tool emitiu — o mesmo caminho do `artifact-renderer`. */
function documentoDoRealOffer(ctx: ContextoDasTools): string {
	return renderToStaticMarkup(
		createElement(ProposalDoc, { payload: payloadDoRealOffer(ctx) as unknown as RealOfferPayload }),
	);
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

describe("P268 — o lance dito no MESMO turno do fechamento vira frase de posição", () => {
	it("lance declarado na fala deste turno, ainda não persistido, é comparado no fecho", async () => {
		// O turno grava o lance em `estado.funnel.qualifyAnswers` (turno-livre.ts:689)
		// e só persiste no FIM do turno (:1053) — quando `fazer_proposta` roda, o
		// metadata lido do banco ainda é o do turno anterior, sem lance nenhum.
		mocks.startContract.mockResolvedValue({
			proposalId: "proposta-1",
			requestedCreditValue: CARTA_NA_TELA.carta,
			offer: ofertaReal({ avgBidValue: 45_000 }),
		});
		const ctx = ctxDoTurno({ perfilDeclarado: { lanceValue: 30_000 } });
		await fechar(ctx);

		expect(ctx.falasDoFecho.join(" ")).toContain("abaixo do lance médio");
	});

	it("o lance deste turno vence o persistido (o cliente acabou de declarar outro)", async () => {
		mocks.reloadMeta.mockImplementation(async () =>
			metaDaConversa({ qualifyAnswers: { creditMax: 92_902, lanceValue: 50_000 } }),
		);
		mocks.startContract.mockResolvedValue({
			proposalId: "proposta-1",
			requestedCreditValue: CARTA_NA_TELA.carta,
			offer: ofertaReal({ avgBidValue: 45_000 }),
		});
		const ctx = ctxDoTurno({ perfilDeclarado: { lanceValue: 30_000 } });
		await fechar(ctx);

		const falas = ctx.falasDoFecho.join(" ");
		expect(falas).toContain("abaixo do lance médio");
		expect(falas).not.toContain("acima do lance médio");
	});
});

describe("P144 — o nome factual do cliente chega ao documento da proposta", () => {
	it("nome conhecido na conversa vai no payload e imprime a linha Cliente", async () => {
		const ctx = ctxDoTurno({ nomeDoCliente: "Bruna" });
		await fechar(ctx);

		expect(payloadDoRealOffer(ctx).clientName).toBe("Bruna");
		const documento = documentoDoRealOffer(ctx);
		expect(documento).toContain("Cliente");
		expect(documento).toContain("Bruna");
	});

	it("sem nome conhecido o documento omite a linha Cliente, em vez de inventar", async () => {
		const ctx = ctxDoTurno();
		await fechar(ctx);

		expect(payloadDoRealOffer(ctx)).not.toHaveProperty("clientName");
		expect(documentoDoRealOffer(ctx)).not.toContain("Cliente");
	});
});

/** As SEQUÊNCIAS do turno que terminam no documento da proposta.
 *
 * A tabela é de sequências, não de frases soltas: o que se prova é o que o
 * contexto das tools tem depois de cada `salvar_nome`, e o que o documento
 * imprime em seguida. `salvar` vazio = o modelo não chamou a tool do nome. */
type CasoDeSequencia = {
	caso: string;
	/** A fala do cliente NESTE turno (o nome só grava se estiver nela). */
	fala: string;
	/** O nome que a conversa já tinha antes das tools (`null` = nenhum). */
	nomeConhecido: string | null;
	/** As chamadas a `salvar_nome`, na ordem do turno, com o trecho que a tool
	 * tem de responder (a resposta é o que ensina o modelo quando falha). */
	salvar: { nome: string; resposta: string }[];
	/** `ctx.nomeDoCliente` depois das tools — o que a próxima tool lê. */
	contextoDepois: string | null;
	/** O `clientName` que o documento tem de sair com (`null` = linha omitida). */
	clientName: string | null;
};

const CASOS_DE_SEQUENCIA: CasoDeSequencia[] = [
	{
		caso: "ninguém se apresentou e o modelo não chamou a tool: documento sem linha Cliente",
		fala: "pode fechar",
		nomeConhecido: null,
		salvar: [],
		contextoDepois: null,
		clientName: null,
	},
	{
		caso: "nome já conhecido na entrada, sem tool do nome no turno",
		fala: "pode fechar",
		nomeConhecido: "Bruna",
		salvar: [],
		contextoDepois: "Bruna",
		clientName: "Bruna",
	},
	{
		caso: "nome salvo NO TURNO do fechamento (a sequência que a auditoria pediu)",
		fala: "me chamo Bruna Souza, pode fechar",
		nomeConhecido: null,
		salvar: [{ nome: "Bruna Souza", resposta: "[Nome 'Bruna' salvo.]" }],
		contextoDepois: "Bruna",
		clientName: "Bruna",
	},
	{
		caso: "nome conhecido repetido no turno não muda o documento",
		fala: "sou a Bruna, pode fechar",
		nomeConhecido: "Bruna",
		salvar: [{ nome: "Bruna", resposta: "[Nome 'Bruna' salvo.]" }],
		contextoDepois: "Bruna",
		clientName: "Bruna",
	},
	{
		caso: "nome em minúscula no turno sai em Title Case no documento",
		fala: "sou a bruna, pode fechar",
		nomeConhecido: null,
		salvar: [{ nome: "bruna", resposta: "[Nome 'Bruna' salvo.]" }],
		contextoDepois: "Bruna",
		clientName: "Bruna",
	},
	{
		caso: "caixa alta no turno vira Title Case",
		fala: "SOU A BRUNA, PODE FECHAR",
		nomeConhecido: null,
		salvar: [{ nome: "BRUNA", resposta: "[Nome 'Bruna' salvo.]" }],
		contextoDepois: "Bruna",
		clientName: "Bruna",
	},
	{
		caso: "acento é preservado no nome gravado",
		fala: "aqui é o CÉSAR, pode fechar",
		nomeConhecido: null,
		salvar: [{ nome: "CÉSAR", resposta: "[Nome 'César' salvo.]" }],
		contextoDepois: "César",
		clientName: "César",
	},
	{
		caso: "nome hifenizado mantém o hífen na capitalização",
		fala: "sou jean-luc, pode fechar",
		nomeConhecido: null,
		salvar: [{ nome: "jean-luc", resposta: "[Nome 'Jean-Luc' salvo.]" }],
		contextoDepois: "Jean-Luc",
		clientName: "Jean-Luc",
	},
	{
		caso: "nome TROCADO no turno vence o que já estava gravado",
		fala: "na verdade é Ana, pode fechar",
		nomeConhecido: "Bruna",
		salvar: [{ nome: "Ana", resposta: "[Nome 'Ana' salvo.]" }],
		contextoDepois: "Ana",
		clientName: "Ana",
	},
	{
		caso: "nome trocado em minúscula também é normalizado",
		fala: "me chama de vitória, pode fechar",
		nomeConhecido: "Bruna",
		salvar: [{ nome: "vitória", resposta: "[Nome 'Vitória' salvo.]" }],
		contextoDepois: "Vitória",
		clientName: "Vitória",
	},
	{
		caso: "salvar_nome que falha (nome inventado) NÃO muda o contexto vazio",
		fala: "pode fechar",
		nomeConhecido: null,
		salvar: [{ nome: "Bruna", resposta: "[Nome NÃO gravado: nao_ancorado]" }],
		contextoDepois: null,
		clientName: null,
	},
	{
		caso: "salvar_nome que falha depois de um nome gravado mantém o anterior",
		fala: "sou a Bruna, pode fechar",
		nomeConhecido: null,
		salvar: [
			{ nome: "Bruna", resposta: "[Nome 'Bruna' salvo.]" },
			{ nome: "Ana", resposta: "[Nome NÃO gravado: nao_ancorado]" },
		],
		contextoDepois: "Bruna",
		clientName: "Bruna",
	},
	{
		caso: "salvar_nome que falha com nome já conhecido não troca o nome do documento",
		fala: "pode fechar",
		nomeConhecido: "Bruna",
		salvar: [{ nome: "Ana", resposta: "[Nome NÃO gravado: nao_ancorado]" }],
		contextoDepois: "Bruna",
		clientName: "Bruna",
	},
	{
		caso: 'palavra que não é nome de gente ("Voltei") não vira nome',
		fala: "voltei",
		nomeConhecido: null,
		salvar: [{ nome: "Voltei", resposta: "[Nome NÃO gravado: name_invalid]" }],
		contextoDepois: null,
		clientName: null,
	},
	{
		caso: "nome com dígito é recusado e o contexto fica vazio",
		fala: "meu nome é B4, pode fechar",
		nomeConhecido: null,
		salvar: [{ nome: "B4", resposta: "[Nome NÃO gravado: name_invalid]" }],
		contextoDepois: null,
		clientName: null,
	},
];

describe("P144 — `salvar_nome` e `fazer_proposta` no MESMO contexto de tools", () => {
	it.each(CASOS_DE_SEQUENCIA)(
		"$caso",
		async ({ fala, nomeConhecido, salvar, contextoDepois, clientName }) => {
			const ctx = ctxDoTurno({ userText: fala, nomeDoCliente: nomeConhecido });

			for (const chamada of salvar) {
				expect(String(await chamarSalvarNome(ctx, chamada.nome))).toContain(chamada.resposta);
			}
			// O contexto das tools é o que a próxima tool lê — não a meta do banco.
			expect(ctx.nomeDoCliente).toBe(contextoDepois);

			await fechar(ctx);

			if (clientName) {
				expect(payloadDoRealOffer(ctx).clientName).toBe(clientName);
				const documento = documentoDoRealOffer(ctx);
				expect(documento).toContain("Cliente");
				expect(documento).toContain(clientName);
			} else {
				expect(payloadDoRealOffer(ctx)).not.toHaveProperty("clientName");
				expect(documentoDoRealOffer(ctx)).not.toContain("Cliente");
			}
		},
	);
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
