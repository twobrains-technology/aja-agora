import { BeviApiAdapter } from "./bevi/bevi-api-adapter";
import { MockBeviAdapter } from "./mock/mock-bevi-adapter";
import type { AdministradoraAdapter } from "./types";

let _adapter: AdministradoraAdapter | null = null;

function createAdapter(): AdministradoraAdapter {
	const adapterName = process.env.ADMINISTRADORA_ADAPTER ?? "mock";

	switch (adapterName) {
		case "mock":
			return new MockBeviAdapter();
		case "bevi":
			// Integração real com a API de Parceiro Bevi/AGX. Falha alto se o
			// BEVI_API_TOKEN não estiver setado (o parceiro ainda não liberou).
			return new BeviApiAdapter();
		default:
			throw new Error(
				`Unknown adapter: "${adapterName}". Valid values: mock, bevi. Set ADMINISTRADORA_ADAPTER env var.`,
			);
	}
}

export function getAdapter(): AdministradoraAdapter {
	if (!_adapter) {
		_adapter = createAdapter();
	}
	return _adapter;
}

/** Reset singleton — for testing only */
export function resetAdapter(): void {
	_adapter = null;
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
