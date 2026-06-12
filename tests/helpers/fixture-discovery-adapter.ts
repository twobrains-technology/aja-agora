// Adapter de descoberta pra TESTES — usa o MESMO BeviSelfContractAdapter de
// produção, alimentado por um client fake que devolve CAPTURAS REAIS da
// loja-piloto. Nunca inventa número: tudo vem de __fixtures__/*.json.
//   • AUTOS  → ok-selfcontract-simulation.json (ITAÚ/ÂNCORA/BB, 2026-05-27)
//   • IMOVEL → ok-selfcontract-simulation-imovel.json (RODOBENS/ÂNCORA, sweep
//     §6 do bevi-api-requests, 2026-05-27)
//
// FIX-15: o client é SEGMENT-AWARE — `setSegment(seg)` grava o segmento e
// `simulate()` devolve a captura real DAQUELE segmento. Sem isso, o cenário de
// IMOVEL recebia ofertas de AUTOS e o agente caía em handoff honesto (0 grupos
// de imóvel). Testes que passam `offers` explícito continuam recebendo aquele
// array fixo (back-compat, ignora segmento).
//
// Instale nos testes via __setDiscoveryAdapterFactoryForTests(() =>
// fixtureDiscoveryAdapter()) — e restaure com (null) no afterAll.

import okSimulationImovel from "@/lib/adapters/bevi/__fixtures__/ok-selfcontract-simulation-imovel.json";
import okSimulation from "@/lib/adapters/bevi/__fixtures__/ok-selfcontract-simulation.json";
import type { SelfContractIdentity } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import { BeviSelfContractAdapter } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import type { BeviOffer } from "@/lib/adapters/bevi/offer-mapper";
import type { BeviSelfContractClient } from "@/lib/adapters/bevi/self-contract-client";

export const FIXTURE_OFFERS = (
	okSimulation as unknown as { data: { data: { offers: BeviOffer[] } } }
).data.data.offers;

/** FIX-15: ofertas REAIS de IMOVEL (RODOBENS/ÂNCORA, crédito R$ 80k, lance embutido). */
export const FIXTURE_OFFERS_IMOVEL = (
	okSimulationImovel as unknown as { data: { data: { offers: BeviOffer[] } } }
).data.data.offers;

/** Mapa segmento Bevi → captura real. Segmento desconhecido cai no default AUTOS. */
const FIXTURE_OFFERS_BY_SEGMENT: Record<string, BeviOffer[]> = {
	AUTOS: FIXTURE_OFFERS,
	IMOVEL: FIXTURE_OFFERS_IMOVEL,
};

export const FIXTURE_IDENTITY = { cpf: "52998224725", celular: "62999887766" };

export interface FixtureDiscoveryOptions {
	/** Quando presente, o client devolve SEMPRE este array (ignora segmento) —
	 *  back-compat de testes que injetam ofertas específicas. */
	offers?: BeviOffer[];
	/** Provider de identidade — fiel à produção (a Bevi não simula sem identidade).
	 * Default: sempre presente (FIXTURE_IDENTITY), pra testes unitários que não
	 * exercitam o gate identify. O eval da jornada passa `loadIdentity(conversationId)`
	 * pra exigir a coleta REAL antes do reveal (tripwire IdentityNotCollectedError),
	 * impedindo o modelo de free-rodar a descoberta antes do passo identify. */
	identityProvider?: () => Promise<SelfContractIdentity | null>;
}

export function fixtureDiscoveryAdapter(
	opts: FixtureDiscoveryOptions | BeviOffer[] = {},
): BeviSelfContractAdapter {
	// Compat: assinatura antiga aceitava `offers` posicional.
	const options: FixtureDiscoveryOptions = Array.isArray(opts) ? { offers: opts } : opts;
	const fixedOffers = options.offers;
	const getIdentity = options.identityProvider ?? (async () => FIXTURE_IDENTITY);

	// Segmento corrente, atualizado por setSegment (espelha a produção).
	let currentSegment = "AUTOS";

	const client = {
		createProposal: async () => ({}),
		setSegment: async (segment: string) => {
			currentSegment = segment;
		},
		simulate: async () =>
			fixedOffers ?? FIXTURE_OFFERS_BY_SEGMENT[currentSegment] ?? FIXTURE_OFFERS,
		getMultiProposal: async () => [],
		getSegments: async () => ["AUTOS", "IMOVEL", "MOTOS", "OUTROS BENS", "PESADOS", "SERVICOS"],
	} as unknown as BeviSelfContractClient;

	return new BeviSelfContractAdapter(client, {
		getIdentity,
		getSimulationPrefs: async () => ({ embeddedPercentage: "30", objective: "FAST_APPROVAL" }),
	});
}
