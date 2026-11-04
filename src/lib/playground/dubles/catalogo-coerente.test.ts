// A carta que o discovery dublê mostra tem que existir no catálogo do proposal dublê:
// senão `fazer_proposta` (carta vista indisponível) nunca gera real_offer no playground.
import { describe, expect, it } from "vitest";
import {
	FIXTURE_OFFERS,
	FIXTURE_OFFERS_IMOVEL,
	fixtureDiscoveryAdapter,
} from "./fixture-discovery-adapter";
import { MockProposalGateway } from "./mock-proposal-gateway";

describe("catálogo coerente entre os dublês", () => {
	it.each([
		["AUTOS", "auto"],
		["IMOVEL", "imovel"],
	])("%s: toda carta mostrada existe na simulação do gateway", async (segmento, category) => {
		const mostradas = await fixtureDiscoveryAdapter().searchGroups({
			category,
			creditMin: 60_000,
			creditMax: 100_000,
		} as never);
		expect(mostradas.length).toBeGreaterThan(0);
		const gw = new MockProposalGateway();
		const { proposalId } = await gw.createProposal({ cpf: "52998224725" } as never);
		const sim = await gw.simulate({
			proposalId,
			segmento,
			tipoSimulacao: "valor_total",
			valor: 80_000,
			lanceEmbutido: "nenhum",
		} as never);
		const ids = new Set(sim.offers.map((o) => o.quotaId));
		for (const g of mostradas) expect(ids.has(g.id as string)).toBe(true);
	});

	it.each([
		["AUTOS", FIXTURE_OFFERS],
		["IMOVEL", FIXTURE_OFFERS_IMOVEL],
	])(
		"%s: a mesma cota vem com a mesma administradora, carta, parcela e prazo",
		async (segmento, cartas) => {
			const gw = new MockProposalGateway();
			const { proposalId } = await gw.createProposal({ cpf: "52998224725" } as never);
			const sim = await gw.simulate({
				proposalId,
				segmento,
				tipoSimulacao: "valor_total",
				valor: 80_000,
				lanceEmbutido: "nenhum",
			} as never);
			for (const c of cartas) {
				const o = sim.offers.find((x) => x.quotaId === c.quotaId);
				expect(o, c.quotaId).toBeDefined();
				expect(o?.administradora).toBe(c.bank);
				expect(o?.valorCarta).toBe(c.finalValue);
				expect(o?.parcela).toBe(c.importedInstallmentValue ?? c.installmentValue);
				expect(o?.prazo).toBe(c.term);
				expect(o?.grupo).toBe(c.group);
			}
		},
	);
});
