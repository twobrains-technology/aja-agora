import { discoverySessionForConversation } from "@/lib/bevi/discovery-session";
import { vitrineDisponivel } from "@/lib/bevi/identidade-vitrine";
import { BeviApiAdapter } from "./bevi/bevi-api-adapter";
import { BeviSelfContractAdapter } from "./bevi/bevi-self-contract-adapter";
import { BeviSelfContractProposalGateway } from "./bevi/bevi-self-contract-proposal-gateway";
import { BeviSelfContractClient } from "./bevi/self-contract-client";
import type { ProposalGateway } from "./proposal-gateway";
import type { AdministradoraAdapter } from "./types";

// ============================================================================
// REGRA (diretiva Kairo 2026-06-04, docs/jornada/CONTEXT.md): dado mockado em
// runtime é PROIBIDO. A descoberta (passos 1-4) vem do Trilho B self-contract
// da Bevi; o fechamento (passo 5) da API de Parceiro. O adapter fictício e seus
// JSONs foram DELETADOS — fixtures de capturas reais vivem só em testes, via
// os seams __set*ForTests abaixo.
// ============================================================================

// ── Discovery (Trilho B, proposta-first) — passos 1-4 da jornada ──
// O adapter é POR CONVERSA: a sessão self-contract carrega identidade (CPF do
// gate identify, D1) e cache de ofertas entre turnos. Bounded map; instâncias
// são leves (estado = ofertas da conversa).

type DiscoveryFactory = (conversationId: string) => AdministradoraAdapter;

const DISCOVERY_CACHE_MAX = 500;
const _discoveryCache = new Map<string, AdministradoraAdapter>();

function defaultDiscoveryFactory(conversationId: string): AdministradoraAdapter {
	// O client falha alto sem BEVI_SELFCONTRACT_HASH — sem hash não há descoberta
	// real, e fallback fictício é proibido.
	return new BeviSelfContractAdapter(
		new BeviSelfContractClient(),
		discoverySessionForConversation(conversationId),
	);
}

let _discoveryFactory: DiscoveryFactory = defaultDiscoveryFactory;

/** Adapter de descoberta da conversa — ofertas REAIS da Bevi (Trilho B). */
export function getDiscoveryAdapter(conversationId: string): AdministradoraAdapter {
	const cached = _discoveryCache.get(conversationId);
	if (cached) return cached;
	const adapter = _discoveryFactory(conversationId);
	if (_discoveryCache.size >= DISCOVERY_CACHE_MAX) {
		const oldest = _discoveryCache.keys().next().value;
		if (oldest !== undefined) _discoveryCache.delete(oldest);
	}
	_discoveryCache.set(conversationId, adapter);
	return adapter;
}

/** Test seam — injeta adapter de fixtures (capturas reais) nos testes/evals.
 * Passar null restaura a factory real. Limpa o cache nos dois sentidos. */
export function __setDiscoveryAdapterFactoryForTests(factory: DiscoveryFactory | null): void {
	_discoveryFactory = factory ?? defaultDiscoveryFactory;
	_discoveryCache.clear();
}

// ── Fulfillment (identificado, proposta-first) — passo 5 "Contratar" ──
// Default = bevi (API de Parceiro REAL; exige BEVI_API_TOKEN e falha alto sem).
// Não existe mais gateway mock em runtime — testes injetam via parâmetro
// (fulfillment.ts aceita gateway) ou pelo seam abaixo.

let _gateway: ProposalGateway | null = null;

function createGateway(): ProposalGateway {
	const name = process.env.PROPOSAL_GATEWAY ?? "bevi";
	switch (name) {
		case "bevi":
			return new BeviApiAdapter();
		// FIX-89 (2026-06-28/07-01): Trilho A travado sem prazo (productId/AGX) —
		// fecha via Trilho B (self-contract), que já descobre. Ver
		// docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md.
		case "selfcontract":
			// VITRINE + TRILHO B = FECHO IMPOSSÍVEL. Recusa no boot, não no cliente.
			//
			// A loja self-contract tem UMA proposta corrente por `storeHash`. Com a
			// vitrine ligada, essa proposta é quase sempre a da casa — então todo
			// fecho de cliente bate em `Duplicated Hash`, a retomada confere o dono e
			// recusa com `PropostaDeOutroTitularError`. A recusa está certa (é ela
			// que impede contrato em nome errado), mas o resultado é que NENHUMA
			// venda fecha, e o cliente descobre isso no último clique.
			//
			// Uma env separava o desastre da paralisia; agora nenhuma das duas passa
			// em silêncio. Para usar o Trilho B, desligue a vitrine — ou peça à Bevi
			// um `storeHash` dedicado para ela, que é o desenho recomendado.
			if (vitrineDisponivel()) {
				throw new Error(
					'PROPOSAL_GATEWAY="selfcontract" é incompatível com a VITRINE ligada: ' +
						"a loja tem uma proposta corrente por storeHash, então todo fechamento " +
						"cairia na proposta da casa e seria recusado (PropostaDeOutroTitularError). " +
						"Desligue VITRINE_CPF/VITRINE_CELULAR ou use um storeHash dedicado à vitrine.",
				);
			}
			return new BeviSelfContractProposalGateway(new BeviSelfContractClient());
		case "mock":
			throw new Error(
				'PROPOSAL_GATEWAY="mock" foi REMOVIDO (mock em runtime é proibido — ' +
					"docs/jornada/CONTEXT.md). Em dev/teste use BEVI_API_TOKEN da loja-piloto " +
					"ou injete um gateway de teste via parâmetro/__setProposalGatewayForTests.",
			);
		default:
			throw new Error(
				`Unknown gateway: "${name}". Valid values: bevi, selfcontract. Set PROPOSAL_GATEWAY env var.`,
			);
	}
}

export function getProposalGateway(): ProposalGateway {
	if (!_gateway) _gateway = createGateway();
	return _gateway;
}

/** Test seam — injeta gateway de teste. Passar null restaura o real. */
export function __setProposalGatewayForTests(gateway: ProposalGateway | null): void {
	_gateway = gateway;
}

/** Reset singleton — for testing only */
export function resetGateway(): void {
	_gateway = null;
}

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
