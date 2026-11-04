// A carta que o cliente escolheu não existe no catálogo do CPF real (caso Renan):
// `fazer_proposta` não gera proposta de outra carta, devolve o fato + alternativas
// ao modelo e não emite card de proposta. Gateway falso; fulfillment REAL.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartnerOffer, ProposalGateway } from "@/lib/adapters/proposal-gateway";
import type { ConversationMetadata } from "@/lib/agent/personas";

const mocks = vi.hoisted(() => ({
	reloadMeta: vi.fn(),
	createBeviProposal: vi.fn(),
	updateBeviProposal: vi.fn(),
	chamarFila: vi.fn(),
}));

vi.mock("@/lib/whatsapp/proxy", () => ({
	filaDeVendedoresReal: { chamar: mocks.chamarFila, estado: vi.fn() },
}));
vi.mock("@/db", () => ({
	db: {
		query: {
			leads: {
				findFirst: vi.fn(async () => ({ id: "lead-1", phone: "11987654321", name: "Renan" })),
			},
		},
	},
}));
vi.mock("@/lib/conversation/meta", () => ({
	reloadMeta: mocks.reloadMeta,
	persistMeta: vi.fn(async () => undefined),
}));
vi.mock("@/lib/conversation/messages", () => ({ loadConversationHistory: vi.fn(async () => []) }));
vi.mock("@/lib/conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/conversation/identity")>()),
	loadIdentity: vi.fn(async () => ({ cpf: "11144477735", celular: "11987654321" })),
}));
vi.mock("@/lib/bevi/proposal-repo", () => ({
	getLatestBeviProposal: vi.fn(async () => null),
	createBeviProposal: mocks.createBeviProposal,
	updateBeviProposal: mocks.updateBeviProposal,
	isOfferFresh: vi.fn(() => true),
}));
vi.mock("@/lib/bevi/pessoa", () => ({
	pessoaDaConversa: vi.fn(),
	ultimaPropostaDaPessoa: vi.fn(),
}));
vi.mock("@/lib/bevi/proposal-status", () => ({ checkProposalStatus: vi.fn() }));
vi.mock("@/lib/agent/orchestrator/choose-offer", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/agent/orchestrator/choose-offer")>()),
	listShownOffersForConversation: vi.fn(async () => []),
}));
vi.mock("@/lib/leads/contact-capture", () => ({
	saveContactName: vi.fn(async () => ({ ok: true })),
}));

import { buildToolsLivres, type ContextoDasTools } from "./tools-livres";

function oferta(quotaId: string, valorCarta: number, administradora = "CANOPUS"): PartnerOffer {
	return {
		ofertaId: `oferta-${quotaId}`,
		administradora,
		tipoOferta: "SPECIAL_OFFER",
		grupo: `grupo-${quotaId}`,
		valorCarta,
		parcela: 930.4,
		taxaContemplacao: 0.1,
		quotaId,
		prazo: 100,
	};
}

const gateway = {
	createProposal: async () => ({ proposalId: "prop-cpf-real" }),
	simulate: async () => ({
		simulationSessionId: "sim-1",
		expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
		offers: [oferta("quota-76", 76_000), oferta("quota-60", 60_000, "ITAU")],
	}),
} as unknown as ProposalGateway;

const VISTA = {
	groupId: "quota-vista-80",
	administradora: "CANOPUS",
	carta: 80_000,
	parcela: 977.12,
	prazoMeses: 100,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.reloadMeta.mockImplementation(
		async () =>
			({
				currentCategory: "auto",
				qualifyAnswers: { creditMax: 80_000 },
			}) as unknown as ConversationMetadata,
	);
});

describe("fazer_proposta com a carta vista fora do catálogo do CPF real", () => {
	it("não cria proposta de outra carta, devolve fato + alternativas e nenhum card", async () => {
		const ctx = {
			conversationId: "conv-renan",
			channel: "web",
			userText: "quero essa, bora fechar",
			nomeDoCliente: "Renan",
			cards: [],
			falasDoFecho: [],
			cartasNaTela: [VISTA],
			gruposRevelados: new Map(),
			pediuHumano: false,
			estadoDepoisDaBusca: null,
		} as unknown as ContextoDasTools;
		const tools = buildToolsLivres(ctx, { gateway }) as unknown as Record<
			string,
			{ execute: (i: unknown, o: unknown) => Promise<unknown> }
		>;
		const saida = String(
			await tools.fazer_proposta!.execute(
				{ groupId: VISTA.groupId },
				{ toolCallId: "c1", messages: [] },
			),
		);

		// (1) nenhuma carta de outro grupo foi gravada como proposta
		const gravados = [
			...mocks.createBeviProposal.mock.calls,
			...mocks.updateBeviProposal.mock.calls,
		];
		for (const call of gravados) {
			const snap = call.find((a: unknown) => a && typeof a === "object" && "proposalId" in a) as
				| { ofertaId: unknown; creditValue: unknown; grupo: unknown }
				| undefined;
			expect(snap?.ofertaId).toBeNull();
			expect(snap?.creditValue).toBeNull();
			expect(snap?.grupo).toBeNull();
		}
		// (2) o texto diz o fato e traz as alternativas
		expect(saida).toContain("Proposta NÃO gerada");
		expect(saida).toContain("não está mais disponível");
		expect(saida).toContain("quota-76");
		expect(saida).toContain("ITAÚ");
		expect(saida).toContain("falar_com_humano");
		expect(saida).toContain("nunca troque");
		// (3) sem card de proposta nem fala pronta
		expect(ctx.cards).toEqual([]);
		expect(ctx.falasDoFecho).toEqual([]);
	});
});
