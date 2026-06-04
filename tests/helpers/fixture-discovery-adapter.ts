// Adapter de descoberta pra TESTES — usa o MESMO BeviSelfContractAdapter de
// produção, alimentado por um client fake que devolve CAPTURAS REAIS da
// loja-piloto (ITAÚ/ÂNCORA/BANCO DO BRASIL, segmento AUTOS, 2026-05-27).
// Nunca inventa número: tudo vem de __fixtures__/ok-selfcontract-simulation.json.
//
// Instale nos testes via __setDiscoveryAdapterFactoryForTests(() =>
// fixtureDiscoveryAdapter()) — e restaure com (null) no afterAll.

import okSimulation from "@/lib/adapters/bevi/__fixtures__/ok-selfcontract-simulation.json";
import { BeviSelfContractAdapter } from "@/lib/adapters/bevi/bevi-self-contract-adapter";
import type { BeviOffer } from "@/lib/adapters/bevi/offer-mapper";
import type { BeviSelfContractClient } from "@/lib/adapters/bevi/self-contract-client";

export const FIXTURE_OFFERS = (
	okSimulation as unknown as { data: { data: { offers: BeviOffer[] } } }
).data.data.offers;

export const FIXTURE_IDENTITY = { cpf: "52998224725", celular: "62999887766" };

export function fixtureDiscoveryAdapter(
	offers: BeviOffer[] = FIXTURE_OFFERS,
): BeviSelfContractAdapter {
	const client = {
		createProposal: async () => ({}),
		setSegment: async () => undefined,
		simulate: async () => offers,
		getMultiProposal: async () => [],
		getSegments: async () => ["AUTOS", "IMOVEL", "MOTOS", "OUTROS BENS", "PESADOS", "SERVICOS"],
	} as unknown as BeviSelfContractClient;

	return new BeviSelfContractAdapter(client, {
		getIdentity: async () => FIXTURE_IDENTITY,
		getSimulationPrefs: async () => ({ embeddedPercentage: "30", objective: "FAST_APPROVAL" }),
	});
}
