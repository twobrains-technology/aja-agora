// MockProposalGateway — implementação do ProposalGateway sem token, pra dev/teste/E2E
// do passo 5 "Contratar". Shapes idênticos à API real (capturas em __fixtures__),
// com ofertas geradas em torno do valor pedido pra ficar coerente em qualquer input.
//
// Default quando PROPOSAL_GATEWAY != "bevi". NÃO faz I/O — tudo em memória.

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
} from "../proposal-gateway";
import { OngoingProposalError } from "./bevi-errors";

const SEGMENTS: BeviSegment[] = [
	{ segmento: "AUTOS", segmentoLabel: "AUTOS" },
	{ segmento: "IMOVEL", segmentoLabel: "IMÓVEL" },
	{ segmento: "MOTOS", segmentoLabel: "MOTOS" },
	{ segmento: "OUTROS BENS", segmentoLabel: "OUTROS BENS" },
	{ segmento: "PESADOS", segmentoLabel: "PESADOS" },
	{ segmento: "SERVICOS", segmentoLabel: "SERVIÇOS" },
];

const ADMINS = ["ANCORA", "RODOBENS", "ITAU", "CANOPUS", "BANCO DO BRASIL"];
// prazos típicos por segmento (meses) — só pra gerar parcela coerente no mock
const TERM_BY_SEGMENT: Record<string, number> = {
	IMOVEL: 200,
	AUTOS: 80,
	MOTOS: 60,
	PESADOS: 100,
	SERVICOS: 48,
	"OUTROS BENS": 60,
};

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
		const term = TERM_BY_SEGMENT[input.segmento] ?? 80;
		// crédito-alvo: se valor_parcela, infere a carta a partir da parcela
		const targetCredit =
			input.tipoSimulacao === "valor_parcela" ? Math.round(input.valor * term) : input.valor;
		const embutidoPct = input.lanceEmbutido && input.lanceEmbutido !== "nenhum" ? Number(input.lanceEmbutido) : 0;

		const offers: PartnerOffer[] = ADMINS.slice(0, 3).map((admin, i) => {
			const valorCarta = Math.round(targetCredit * (0.9 + i * 0.12));
			const grossParcela = (valorCarta * 1.18) / term; // ~18% taxa adm diluída
			// lance embutido aumenta a carta efetiva (menos crédito líquido, parcela maior)
			const parcela = grossParcela * (1 + embutidoPct / 100);
			return {
				ofertaId: nextId("oferta"),
				administradora: admin,
				tipoOferta: i === 0 ? "SPECIAL_OFFER" : "FREE_BID",
				grupo: String(500 + i * 37),
				valorCarta,
				parcela,
				taxaContemplacao: 0.6 - i * 0.08,
				quotaId: nextId("quota"),
			};
		});
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
