// MockProposalGateway — implementação do ProposalGateway sem token, pra dev/teste/E2E
// do passo 5 "Contratar". Shapes idênticos à API real (capturas em __fixtures__),
// com ofertas geradas em torno do valor pedido pra ficar coerente em qualquer input.
//
// DUBLÊ — só entra por injeção explícita (nunca por PROPOSAL_GATEWAY; mock em runtime é PROIBIDO,
// docs/jornada/CONTEXT.md). Injete via parâmetro gateway/__setProposalGatewayForTests.

import { OngoingProposalError } from "@/lib/adapters/bevi/bevi-errors";
import type {
	BeviSegment,
	ChooseOfferInput,
	ChooseOfferResult,
	CreateProposalInput,
	CreateProposalResult,
	DocumentLinks,
	InsertAdditionalDataInput,
	PartnerOffer,
	ProposalGateway,
	ProposalStatus,
	SimulateInput,
	SimulationResult,
	UploadDocumentInput,
} from "@/lib/adapters/proposal-gateway";
import { FIXTURE_OFFERS, FIXTURE_OFFERS_IMOVEL } from "./fixture-discovery-adapter";

const SEGMENTS: BeviSegment[] = [
	{ segmento: "AUTOS", segmentoLabel: "AUTOS" },
	{ segmento: "IMOVEL", segmentoLabel: "IMÓVEL" },
	{ segmento: "MOTOS", segmentoLabel: "MOTOS" },
	{ segmento: "OUTROS BENS", segmentoLabel: "OUTROS BENS" },
	{ segmento: "PESADOS", segmentoLabel: "PESADOS" },
	{ segmento: "SERVICOS", segmentoLabel: "SERVIÇOS" },
];

/** Catálogo do dublê = o do discovery dublê: o `quotaId` de cada oferta é o da carta que
 * o `fixtureDiscoveryAdapter` mostra (mesmo segmento), senão "carta vista" nunca casa. */
export const quotaIdsDoCatalogo = (segmento: string): string[] =>
	(segmento === "IMOVEL" ? FIXTURE_OFFERS_IMOVEL : FIXTURE_OFFERS).map((o) => o.quotaId);

let seq = 0;
const nextId = (prefix: string) => `${prefix}-mock-${(++seq).toString(16).padStart(6, "0")}`;

interface MockState {
	proposalId: string;
	cpf: string;
	segmento?: string;
	lastOffers: PartnerOffer[];
	lastExpiresAt?: string;
	chosenOfferId?: string;
	status: string;
}

export interface MockGatewayOptions {
	/** Simula 409 no createProposal (pra exercitar o fluxo "retomar vs nova"). */
	forceOngoing?: string[];
	/** Base de tempo (ISO) pra TTL determinístico em teste. */
	now?: () => number;
}

export class MockProposalGateway implements ProposalGateway {
	private readonly byProposal = new Map<string, MockState>();
	private readonly opts: MockGatewayOptions;

	constructor(opts: MockGatewayOptions = {}) {
		this.opts = opts;
	}

	async createProposal(input: CreateProposalInput): Promise<CreateProposalResult> {
		if (this.opts.forceOngoing && !input.ignoreOngoingProposals) {
			throw new OngoingProposalError(
				"Existem propostas em andamento para este CPF.",
				this.opts.forceOngoing,
			);
		}
		const proposalId = nextId("prop");
		this.byProposal.set(proposalId, {
			proposalId,
			cpf: (input.cpf ?? "").replace(/\D/g, ""),
			lastOffers: [],
			status: "Simulação Consórcio",
		});
		return { proposalId };
	}

	async listSegments(_proposalId: string): Promise<BeviSegment[]> {
		return SEGMENTS;
	}

	async simulate(input: SimulateInput): Promise<SimulationResult> {
		const state = this.byProposal.get(input.proposalId);
		// Mesma cota = mesma administradora, carta, parcela, prazo e grupo do discovery dublê.
		// O dublê não "gera ofertas em torno do valor": devolve o catálogo que o cliente viu,
		// senão a proposta sai de outra marca e o vendedor teria de anunciar troca.
		const cartas = input.segmento === "IMOVEL" ? FIXTURE_OFFERS_IMOVEL : FIXTURE_OFFERS;
		const offers: PartnerOffer[] = cartas.map((c) => ({
			ofertaId: nextId("oferta"),
			administradora: c.bank,
			tipoOferta: c.tipoOferta === "SPECIAL_OFFER" ? "SPECIAL_OFFER" : "FREE_BID",
			grupo: c.grupo ?? c.group,
			valorCarta: c.finalValue,
			parcela: c.importedInstallmentValue ?? c.installmentValue ?? 0,
			prazo: c.term,
			taxaContemplacao: c.taxaContemplacao ?? 0,
			quotaId: c.quotaId,
		}));
		const expiresAt = new Date((this.opts.now?.() ?? mockNow()) + 30 * 60_000).toISOString();
		if (state) {
			state.segmento = input.segmento;
			state.lastOffers = offers;
			state.lastExpiresAt = expiresAt;
		}
		return { simulationSessionId: nextId("sess"), expiresAt, offers };
	}

	async chooseOffer(input: ChooseOfferInput): Promise<ChooseOfferResult> {
		const state = this.byProposal.get(input.proposalId);
		if (state) {
			state.chosenOfferId = input.ofertaId;
			state.status = "Documento pessoal";
		}
		return {
			proposalId: input.proposalId,
			consortiumProposalLink: `https://www.uselink.me/mock-${input.ofertaId.slice(-6)}`,
		};
	}

	async getDocumentLinks(proposalId: string): Promise<DocumentLinks> {
		return {
			proposalId,
			linkDocumentosPessoais: `https://www.uselink.me/mockdocs-${proposalId.slice(-6)}`,
			linkComprovanteEndereco: `https://www.uselink.me/mockend-${proposalId.slice(-6)}`,
		};
	}

	async uploadDocument(_input: UploadDocumentInput): Promise<void> {
		// no-op: no mock, o upload sempre "funciona"
	}

	async insertAdditionalData(input: InsertAdditionalDataInput): Promise<void> {
		const state = this.byProposal.get(input.proposalId);
		if (state) state.status = "Endereço";
	}

	async getStatus(proposalId: string): Promise<ProposalStatus> {
		const state = this.byProposal.get(proposalId);
		const iso = new Date(this.opts.now?.() ?? mockNow()).toISOString();
		return {
			proposalId,
			statusName: state?.status ?? "Simulação Consórcio",
			situation: "pending",
			statusDescription: null,
			integrationCode: null,
			createdAt: iso,
			updatedAt: iso,
			approvedAt: null,
			reprovedAt: null,
			changesHistory: [],
		};
	}
}

// base de tempo fixa pro mock (evita Date.now não-determinístico em snapshots)
function mockNow(): number {
	return Date.parse("2026-06-02T20:00:00.000Z");
}
