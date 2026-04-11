import type { AdministradoraAdapter } from "./types";
import { MockBeviAdapter } from "./mock/mock-bevi-adapter";

let _adapter: AdministradoraAdapter | null = null;

function createAdapter(): AdministradoraAdapter {
	const adapterName = process.env.ADMINISTRADORA_ADAPTER ?? "mock";

	switch (adapterName) {
		case "mock":
			return new MockBeviAdapter();
		// TODO: case 'bevi': return new BeviApiAdapter();
		default:
			throw new Error(
				`Unknown adapter: "${adapterName}". Valid values: mock. Set ADMINISTRADORA_ADAPTER env var.`,
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

export type { AdministradoraAdapter } from "./types";
export type {
	GroupSummary,
	QuotaSimulation,
	RateInfo,
	GroupDetails,
	SearchGroupsParams,
	SimulateQuotaParams,
	GetRatesParams,
	GetGroupDetailsParams,
	ConsorcioCategory,
} from "./types";
