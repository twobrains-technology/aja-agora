import { describe, expect, it, vi } from "vitest";
import {
	BeviSelfContractAdapter,
	GroupNotInDiscoveryError,
} from "./bevi-self-contract-adapter";
import type { BeviOffer } from "./offer-mapper";
import type { BeviSelfContractClient } from "./self-contract-client";

/**
 * Camada 1 (structural) — FIX-72.
 *
 * O adapter é a FONTE DA VERDADE do conjunto de ids reais (`offerIndex`). Quando a
 * LLM pede simular/detalhar um id que nao esta no conjunto (fabricado, expirado), o
 * adapter sinaliza com `GroupNotInDiscoveryError` TIPADO — em `simulateQuota` E
 * `getGroupDetails` — pra tool capturar e devolver diretiva de re-busca em vez de
 * erro cru. Desacoplado do formato do id (respeita o adapter pattern).
 */

const IDENTITY = { cpf: "12345678900", celular: "62999887766" };

function makeOffer(quotaId: string, value: number): BeviOffer {
	return {
		quotaId,
		bank: "ITAÚ",
		bankLabel: "ITAÚ",
		group: `G-${quotaId}`,
		term: 60,
		finalValue: value,
		importedInstallmentValue: Math.round(value / 60),
		adminFee: 0.18,
		productType: "AUTOS",
		monthlyAwardedQuotas: 2,
		proximaAssembleia: "2026-07-15",
	};
}

function makeAdapter(offers: BeviOffer[]) {
	const client = {
		createProposal: vi.fn(async () => ({})),
		setSegment: vi.fn(async () => undefined),
		simulate: vi.fn(async () => offers),
		getMultiProposal: vi.fn(async () => []),
		getSegments: vi.fn(async () => ["AUTOS"]),
	} as unknown as BeviSelfContractClient;
	return new BeviSelfContractAdapter(client, {
		getIdentity: async () => IDENTITY,
		getSimulationPrefs: async () => ({ embeddedPercentage: "30" }),
	});
}

describe("BeviSelfContractAdapter — id fora do offerIndex sinaliza re-busca (FIX-72)", () => {
	it("simulateQuota com id fabricado lança GroupNotInDiscoveryError (não Error cru)", async () => {
		const adapter = makeAdapter([makeOffer("6a0ca9c73e68cce9b61d30fd", 180000)]);
		await adapter.searchGroups({ category: "auto", creditMax: 180000 });
		await expect(
			adapter.simulateQuota({ groupId: "auto-180k", creditValue: 180000 }),
		).rejects.toBeInstanceOf(GroupNotInDiscoveryError);
	});

	it("getGroupDetails com id fabricado (com nome do usuário) lança GroupNotInDiscoveryError", async () => {
		const adapter = makeAdapter([makeOffer("6a0ca9c73e68cce9b61d30fd", 180000)]);
		await adapter.searchGroups({ category: "auto", creditMax: 180000 });
		await expect(
			adapter.getGroupDetails({ groupId: "auto-180k-kairo" }),
		).rejects.toBeInstanceOf(GroupNotInDiscoveryError);
	});

	it("o erro carrega o groupId ofensor e mensagem que cita oferta/grupo (não regride o teste legado)", async () => {
		const adapter = makeAdapter([makeOffer("6a0ca9c73e68cce9b61d30fd", 180000)]);
		await adapter.searchGroups({ category: "auto", creditMax: 180000 });
		await expect(
			adapter.simulateQuota({ groupId: "nao-existe", creditValue: 180000 }),
		).rejects.toThrow(/oferta|grupo/i);
		const err = await adapter
			.getGroupDetails({ groupId: "auto-180k" })
			.catch((e) => e as GroupNotInDiscoveryError);
		expect(err.groupId).toBe("auto-180k");
	});

	it("id REAL (no offerIndex) continua resolvendo normalmente — sem falso-positivo", async () => {
		const adapter = makeAdapter([makeOffer("6a0ca9c73e68cce9b61d30fd", 180000)]);
		await adapter.searchGroups({ category: "auto", creditMax: 180000 });
		const sim = await adapter.simulateQuota({
			groupId: "6a0ca9c73e68cce9b61d30fd",
			creditValue: 180000,
		});
		expect(sim.creditValue).toBe(180000);
	});
});
