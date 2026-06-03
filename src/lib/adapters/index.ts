import { BeviApiAdapter } from "./bevi/bevi-api-adapter";
import { MockProposalGateway } from "./bevi/mock-proposal-gateway";
import { MockBeviAdapter } from "./mock/mock-bevi-adapter";
import type { ProposalGateway } from "./proposal-gateway";
import type { AdministradoraAdapter } from "./types";

// ── Discovery (anônimo, grupo-cêntrico) — passos 1-4 da jornada ──
// Não há trilho Bevi anônimo (a API é proposta-first); Discovery é sempre mock/rico.
let _adapter: AdministradoraAdapter | null = null;

function createAdapter(): AdministradoraAdapter {
	const name = process.env.ADMINISTRADORA_ADAPTER ?? "mock";
	switch (name) {
		case "mock":
			return new MockBeviAdapter();
		case "bevi":
			throw new Error(
				"Discovery não tem adapter 'bevi' (a API de Parceiro é proposta-first, sem busca anônima). " +
					"Use ADMINISTRADORA_ADAPTER=mock pra Descoberta e PROPOSAL_GATEWAY=bevi pro fechamento.",
			);
		default:
			throw new Error(
				`Unknown adapter: "${name}". Valid values: mock. Set ADMINISTRADORA_ADAPTER env var.`,
			);
	}
}

export function getAdapter(): AdministradoraAdapter {
	if (!_adapter) _adapter = createAdapter();
	return _adapter;
}

/** Reset singleton — for testing only */
export function resetAdapter(): void {
	_adapter = null;
}

// ── Fulfillment (identificado, proposta-first) — passo 5 "Contratar" ──
// mock = sem token (dev/teste/E2E); bevi = API de Parceiro real (exige BEVI_API_TOKEN).
let _gateway: ProposalGateway | null = null;

function createGateway(): ProposalGateway {
	const name = process.env.PROPOSAL_GATEWAY ?? "mock";
	switch (name) {
		case "mock":
			return new MockProposalGateway();
		case "bevi":
			// Falha alto sem BEVI_API_TOKEN (proteção: criar proposta real = dado real).
			return new BeviApiAdapter();
		default:
			throw new Error(
				`Unknown gateway: "${name}". Valid values: mock, bevi. Set PROPOSAL_GATEWAY env var.`,
			);
	}
}

export function getProposalGateway(): ProposalGateway {
	if (!_gateway) _gateway = createGateway();
	return _gateway;
}

/** Reset singleton — for testing only */
export function resetGateway(): void {
	_gateway = null;
}

export type {
	AdministradoraAdapter,
	ConsorcioCategory,
	GetGroupDetailsParams,
	GetRatesParams,
	GroupDetails,
	GroupSummary,
	QuotaSimulation,
	RateInfo,
	SearchGroupsParams,
	SimulateQuotaParams,
} from "./types";
export type {
	ChooseOfferResult,
	CreateProposalInput,
	DocumentLinks,
	PartnerOffer,
	ProposalGateway,
	ProposalStatus,
	SimulateInput,
	SimulationResult,
} from "./proposal-gateway";
