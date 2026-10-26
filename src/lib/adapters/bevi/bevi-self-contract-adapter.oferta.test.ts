// Achado F2 do testador no dev (conversas 518a3818 e dfd69823): a tabela mostrou o
// grupo `6abfaec94c0ff2a8453a7388` com R$ 60.000 / R$ 788 / 114 m — a variante SEM
// lance embutido, a primeira da lista — e o `simulation_result` do MESMO grupo saiu
// com 85.000 / 1.038,61, a variante com lance embutido (85.000·0,7 ≈ 59.500). O índice
// guardava UMA oferta por quotaId e a última variante sobrescrevia a primeira.
// Os números abaixo são os da prova do testador (payload persistido no dev).
//
// O índice é montado pelo caminho real (`searchGroups`): é a busca que popula o índice,
// e a lista que o cliente viu é o que a simulação tem que reproduzir.

import { describe, expect, it } from "vitest";
import { BeviSelfContractAdapter, GroupNotInDiscoveryError } from "./bevi-self-contract-adapter";
import type { BeviOffer } from "./offer-mapper";
import type { BeviSelfContractClient } from "./self-contract-client";

const GRUPO = "6abfaec94c0ff2a8453a7388";

/** Variante SEM lance embutido — a linha que o cliente viu na tabela. */
const semEmbutido: BeviOffer = {
	quotaId: GRUPO,
	group: "4471",
	bank: "ANCORA",
	bankLabel: "ÂNCORA",
	productType: "AUTOS",
	finalValue: 60_000,
	importedInstallmentValue: 788,
	term: 114,
	adminFee: 0.25,
	reserveFundFee: 0.02,
	insuranceFee: 0.03,
	totalPaid: 90_000,
	monthlyAwardedQuotas: 15,
};

/** Variante COM lance embutido (30%) do MESMO grupo: carta 85.000, líquido 59.500. */
const comEmbutido: BeviOffer = {
	quotaId: GRUPO,
	group: "4471",
	bank: "ANCORA",
	bankLabel: "ÂNCORA",
	productType: "AUTOS",
	finalValue: 85_000,
	receivedCredit: 59_500,
	embeddedBid: 25_500,
	importedInstallmentValue: 1038.61,
	term: 114,
	adminFee: 0.27,
	reserveFundFee: 0.02,
	insuranceFee: 0.03,
	totalPaid: 118_400.07,
	monthlyAwardedQuotas: 15,
};

/** Dublê do cliente HTTP (mesmo padrão de `self-contract-client.test.ts`): só os métodos
 * que o adapter de descoberta usa. Registra uma entrada por variante simulada. */
function dubleCliente(offersPorVariante: Record<string, BeviOffer[]>) {
	const variantesSimuladas: Array<string | undefined> = [];
	const cliente = {
		createProposal: async () => ({}),
		setSegment: async () => {},
		simulate: async (input: { embeddedPercentage?: string }) => {
			variantesSimuladas.push(input.embeddedPercentage);
			return offersPorVariante[input.embeddedPercentage ?? "none"] ?? [];
		},
	} as unknown as BeviSelfContractClient;
	return { cliente, variantesSimuladas };
}

const identidade = { cpf: "52998224725", celular: "11987654321" };

/** `gapMs: 0` — as duas queries do mesmo valor caem no mesmo teste sem espera artificial. */
function adapterDo(
	client: BeviSelfContractClient,
	prefs: { embeddedPercentage?: "30" | "50" } = { embeddedPercentage: "30" },
) {
	return new BeviSelfContractAdapter(
		client,
		{
			getIdentity: async () => identidade,
			getSimulationPrefs: async () => prefs,
		},
		{ gapMs: 0 },
	);
}

const busca = { category: "auto" as const, creditMin: 60_000, creditMax: 60_000 };

/** P133/P264 (R12-3): a MESMA carta, mas resposta nova da Bevi — parcela atualizada.
 * Entra por outra chave de cache (busca por parcela), então o `searchGroups` mostra
 * 820; o índice tem que concordar com o que a busca mostrou, não guardar a 788. */
const parcelaAtualizada: BeviOffer = {
	quotaId: GRUPO,
	group: "4471",
	bank: "ANCORA",
	bankLabel: "ÂNCORA",
	productType: "AUTOS",
	finalValue: 60_000,
	importedInstallmentValue: 820,
	term: 114,
	adminFee: 0.25,
	reserveFundFee: 0.02,
	insuranceFee: 0.03,
	totalPaid: 93_480,
	monthlyAwardedQuotas: 15,
};

/** Dublê com uma oferta por CHAVE de cache (o que `ensureOffers` consulta antes da
 * rede): duas buscas de chaves distintas produziram respostas distintas do mesmo grupo. */
function dubleClientePorChave(offersPorChave: Record<string, BeviOffer[]>) {
	const chavesSimuladas: string[] = [];
	const cliente = {
		createProposal: async () => ({}),
		setSegment: async () => {},
		simulate: async (input: {
			simulationType?: string;
			simulationValue?: number;
			embeddedPercentage?: string;
		}) => {
			const key = `${input.simulationType ?? "TOTAL_VALUE"}:${input.simulationValue}:${input.embeddedPercentage ?? "none"}`;
			chavesSimuladas.push(key);
			return offersPorChave[key] ?? [];
		},
	} as unknown as BeviSelfContractClient;
	return { cliente, chavesSimuladas };
}

describe("busca nova do mesmo grupo substitui a oferta indexada da mesma variante", () => {
	it("simulateQuota devolve a parcela da última carta mostrada, não a antiga", async () => {
		const { cliente, chavesSimuladas } = dubleClientePorChave({
			"TOTAL_VALUE:60000:none": [semEmbutido],
			"INSTALLMENT_VALUE:820:none": [parcelaAtualizada],
		});
		// Sem embutido opt-in: só a baseline, pra a variante das duas buscas ser a mesma.
		const adapter = adapterDo(cliente, {});

		const primeira = await adapter.searchGroups(busca);
		expect(primeira[0]?.monthlyPayment).toBe(788);

		const segunda = await adapter.searchGroups({ category: "auto", parcelaAlvo: 820 });
		expect(segunda[0]?.monthlyPayment).toBe(820);
		// Chaves distintas = duas chamadas reais; a segunda resposta é NOVA, não o cache.
		expect(chavesSimuladas).toEqual(["TOTAL_VALUE:60000:none", "INSTALLMENT_VALUE:820:none"]);

		// Busca e simulação concordam na MESMA carta (60.000).
		const sim = await adapter.simulateQuota({ groupId: GRUPO, creditValue: 60_000 });
		expect(sim.creditValue).toBe(60_000);
		expect(sim.monthlyPayment).toBe(820);
		// A ordem das variantes não muda: a primeira continua sendo a que a lista mostra,
		// agora com o valor atualizado — e continua uma variante só por carta.
		expect((await adapter.getGroupDetails({ groupId: GRUPO })).monthlyPayment).toBe(820);
	});

	it("variantes diferentes continuam separadas quando uma resposta atualiza outra variante", async () => {
		const { cliente } = dubleClientePorChave({
			"TOTAL_VALUE:60000:none": [semEmbutido],
			"TOTAL_VALUE:60000:30": [comEmbutido],
			"INSTALLMENT_VALUE:820:none": [parcelaAtualizada],
		});
		const adapter = adapterDo(cliente);

		await adapter.searchGroups(busca);
		const lista = await adapter.searchGroups({ category: "auto", parcelaAlvo: 820 });
		// A lista da segunda busca: variante SEM embutido atualizada; a variante COM
		// embutido (carta 85.000) não é a mesma variante e não é sobrescrita.
		expect(lista.map((g) => g.creditValue)).toEqual([60_000]);

		const simAtualizada = await adapter.simulateQuota({ groupId: GRUPO, creditValue: 60_000 });
		expect(simAtualizada.monthlyPayment).toBe(820);
		const simEmbutida = await adapter.simulateQuota({ groupId: GRUPO, creditValue: 85_000 });
		expect(simEmbutida.monthlyPayment).toBe(1038.61);
	});
});

describe("índice de ofertas guarda todas as variantes do mesmo quotaId", () => {
	it("simulateQuota devolve a variante que a tabela mostrou (60.000), não a última", async () => {
		const { cliente, variantesSimuladas } = dubleCliente({
			none: [semEmbutido],
			"30": [comEmbutido],
		});
		const adapter = adapterDo(cliente);

		const lista = await adapter.searchGroups(busca);
		expect(variantesSimuladas).toEqual([undefined, "30"]);
		// A lista é o que o cliente viu: a primeira variante do grupo.
		expect(lista.map((g) => g.creditValue)).toEqual([60_000]);

		const sim = await adapter.simulateQuota({ groupId: GRUPO, creditValue: 60_000 });
		expect(sim.creditValue).toBe(60_000);
		expect(sim.monthlyPayment).toBe(788);
	});

	it("creditValue da variante embutida escolhe a variante embutida", async () => {
		const { cliente } = dubleCliente({ none: [semEmbutido], "30": [comEmbutido] });
		const adapter = adapterDo(cliente);

		await adapter.searchGroups(busca);

		const sim = await adapter.simulateQuota({ groupId: GRUPO, creditValue: 85_000 });
		expect(sim.creditValue).toBe(85_000);
		expect(sim.monthlyPayment).toBe(1038.61);
	});

	it("sem creditValue, ou com valor que não casa, cai na primeira variante", async () => {
		const { cliente } = dubleCliente({ none: [semEmbutido], "30": [comEmbutido] });
		const adapter = adapterDo(cliente);

		await adapter.searchGroups(busca);

		const semValor = await adapter.simulateQuota({
			groupId: GRUPO,
			creditValue: undefined as unknown as number,
		});
		expect(semValor.creditValue).toBe(60_000);

		const valorQueNaoCasa = await adapter.simulateQuota({ groupId: GRUPO, creditValue: 120_000 });
		expect(valorQueNaoCasa.creditValue).toBe(60_000);
	});

	it("a mesma variante não entra duas vezes (re-busca do mesmo valor)", async () => {
		const { cliente, variantesSimuladas } = dubleCliente({
			none: [semEmbutido],
			"30": [comEmbutido],
		});
		const adapter = adapterDo(cliente);

		await adapter.searchGroups(busca);
		await adapter.searchGroups(busca);

		// Cache por variante: a segunda busca não volta à rede nem duplica o grupo.
		expect(variantesSimuladas).toHaveLength(2);
		const sim = await adapter.simulateQuota({ groupId: GRUPO, creditValue: 60_000 });
		expect(sim.creditValue).toBe(60_000);
	});

	it("getGroupDetails mostra a variante da lista — a primeira", async () => {
		const { cliente } = dubleCliente({ none: [semEmbutido], "30": [comEmbutido] });
		const adapter = adapterDo(cliente);

		await adapter.searchGroups(busca);

		const detalhe = await adapter.getGroupDetails({ groupId: GRUPO });
		expect(detalhe.creditValue).toBe(60_000);
		expect(detalhe.monthlyPayment).toBe(788);
	});

	it("getRates percorre a primeira variante de cada grupo — uma linha por grupo", async () => {
		const { cliente } = dubleCliente({ none: [semEmbutido], "30": [comEmbutido] });
		const adapter = adapterDo(cliente);

		await adapter.searchGroups(busca);

		const taxas = await adapter.getRates({ category: "auto" });
		expect(taxas).toHaveLength(1);
		// adminFee da variante da lista (25%), não a da variante embutida (27%).
		expect(taxas[0]?.adminFeePercent).toBe(25);
	});
});

describe("uma variante só — comportamento inalterado", () => {
	it("grupo com uma variante simula e detalha por ela", async () => {
		const { cliente, variantesSimuladas } = dubleCliente({ none: [semEmbutido] });
		// Sem lance embutido opt-in: só a baseline roda, como sempre.
		const adapter = adapterDo(cliente, {});

		await adapter.searchGroups(busca);
		expect(variantesSimuladas).toEqual([undefined]);

		const sim = await adapter.simulateQuota({ groupId: GRUPO, creditValue: 60_000 });
		expect(sim.creditValue).toBe(60_000);
		expect(sim.monthlyPayment).toBe(788);

		expect((await adapter.getGroupDetails({ groupId: GRUPO })).creditValue).toBe(60_000);
		expect((await adapter.getRates({ category: "auto" }))[0]?.adminFeePercent).toBe(25);
	});
});

describe("grupo ausente da descoberta continua lançando GroupNotInDiscoveryError", () => {
	it("simulateQuota de um id fora do índice", async () => {
		const { cliente } = dubleCliente({ none: [semEmbutido] });
		const adapter = adapterDo(cliente, {});

		await adapter.searchGroups(busca);

		await expect(
			adapter.simulateQuota({ groupId: "auto-180k", creditValue: 60_000 }),
		).rejects.toBeInstanceOf(GroupNotInDiscoveryError);
	});

	it("getGroupDetails de um id fora do índice", async () => {
		const { cliente } = dubleCliente({ none: [semEmbutido] });
		const adapter = adapterDo(cliente, {});

		await adapter.searchGroups(busca);

		await expect(adapter.getGroupDetails({ groupId: "auto-180k" })).rejects.toBeInstanceOf(
			GroupNotInDiscoveryError,
		);
	});
});
