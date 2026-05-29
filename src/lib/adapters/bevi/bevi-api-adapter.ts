// BeviApiAdapter — entry point da integração real com a API de Parceiro Bevi/AGX
// (CreditHub). Trilho A: gateway RPC `POST /api/v1/credithub/services` roteado
// pelo header `service_id`. Ver docs/integracoes/bevi-api-discovery.md.
//
// ⚠️ ESTADO: a API NÃO está disponível ainda (o parceiro ainda não liberou o
// API token). Este adapter é o SCAFFOLD da integração — ele falha alto na
// construção se o token não estiver no env, garantindo que NUNCA toquemos a
// base de produção do parceiro às cegas (criar proposta real exige CPF real).
//
// Quando o token chegar:
//   1. setar ADMINISTRADORA_ADAPTER=bevi + BEVI_API_TOKEN + BEVI_BASE_URL.
//   2. implementar o fluxo proposta-first (insert_proposal → list_segments →
//      calculate_simulation → choose_offer → insert_additional_data) — ver §3
//      da aderência. A descoberta anônima (searchGroups/simulateQuota) precisa
//      do split Discovery/Fulfillment (aderência §7.1): até lá, o mock cobre a
//      descoberta e este adapter cobre o fechamento.
//   3. o mapeamento offer→domínio já está pronto e testado em ./offer-mapper.ts.

import type {
	AdministradoraAdapter,
	GetGroupDetailsParams,
	GetRatesParams,
	GroupDetails,
	GroupSummary,
	QuotaSimulation,
	RateInfo,
	SearchGroupsParams,
	SimulateQuotaParams,
} from "../types";

export interface BeviApiConfig {
	baseUrl: string;
	apiToken: string;
	productId: string;
}

const NOT_AVAILABLE =
	"BeviApiAdapter ainda não está disponível: o parceiro (AGX/Bevi) não liberou o API token. " +
	"Use ADMINISTRADORA_ADAPTER=mock até lá. Ver docs/integracoes/bevi-consorcio-aderencia.md.";

/** Lê a config do env. Lança se faltar token — proteção contra hit acidental
 * em produção do parceiro. */
export function loadBeviConfigFromEnv(): BeviApiConfig {
	const apiToken = process.env.BEVI_API_TOKEN;
	if (!apiToken) {
		throw new Error(NOT_AVAILABLE);
	}
	return {
		baseUrl: process.env.BEVI_BASE_URL ?? "https://api.uxvision.tech/api/v1/credithub/services",
		apiToken,
		productId: process.env.BEVI_PRODUCT_ID ?? "6986245b3518ceb00e7844da",
	};
}

export class BeviApiAdapter implements AdministradoraAdapter {
	private readonly config: BeviApiConfig;

	constructor(config?: BeviApiConfig) {
		// Construção exige config válida — sem token, falha alto (não há fallback
		// silencioso pra produção do parceiro).
		this.config = config ?? loadBeviConfigFromEnv();
	}

	async searchGroups(_params: SearchGroupsParams): Promise<GroupSummary[]> {
		// Descoberta anônima não tem equivalente direto (Bevi é proposta-first).
		// Pendente do split Discovery/Fulfillment (aderência §7.1) + token.
		throw new Error(NOT_AVAILABLE);
	}

	async simulateQuota(_params: SimulateQuotaParams): Promise<QuotaSimulation> {
		throw new Error(NOT_AVAILABLE);
	}

	async getRates(_params: GetRatesParams): Promise<RateInfo[]> {
		throw new Error(NOT_AVAILABLE);
	}

	async getGroupDetails(_params: GetGroupDetailsParams): Promise<GroupDetails> {
		throw new Error(NOT_AVAILABLE);
	}
}
