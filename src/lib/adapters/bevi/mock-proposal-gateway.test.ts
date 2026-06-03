import { describe, expect, it } from "vitest";
import { MockProposalGateway } from "./mock-proposal-gateway";
import { OngoingProposalError } from "./bevi-errors";

const baseProposal = {
	cpf: "12345678909",
	celular: "11999998888",
	termoLgpd: true,
	consultaDados: true,
};

describe("MockProposalGateway — fluxo de fechamento sem token", () => {
	it("happy path coerente: proposta → simular → escolher → docs", async () => {
		const gw = new MockProposalGateway();
		const { proposalId } = await gw.createProposal(baseProposal);
		expect(proposalId).toMatch(/^prop-mock-/);

		const sim = await gw.simulate({
			proposalId,
			segmento: "AUTOS",
			tipoSimulacao: "valor_total",
			valor: 50000,
			objetivo: "contemplacao_rapida",
		});
		expect(sim.offers.length).toBeGreaterThan(0);
		// cartas em torno do valor pedido (não 36k fixo)
		expect(sim.offers[0].valorCarta).toBeGreaterThan(30000);
		expect(sim.offers[0].valorCarta).toBeLessThan(80000);
		expect(sim.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

		const chosen = await gw.chooseOffer({ proposalId, ofertaId: sim.offers[0].ofertaId });
		expect(chosen.consortiumProposalLink).toContain("uselink.me");

		const links = await gw.getDocumentLinks(proposalId);
		expect(links.linkDocumentosPessoais).toContain("uselink.me");

		await expect(
			gw.uploadDocument({
				proposalId,
				documentsLink: links.linkDocumentosPessoais,
				slot: "identidade_frente",
				file: new Uint8Array([1]),
				filename: "rg.jpg",
				mimeType: "image/jpeg",
			}),
		).resolves.toBeUndefined();

		const status = await gw.getStatus(proposalId);
		expect(status.statusName).toBe("Documento pessoal");
	});

	it("lance embutido aumenta a parcela (menos crédito líquido)", async () => {
		const gw = new MockProposalGateway();
		const { proposalId } = await gw.createProposal(baseProposal);
		const sem = await gw.simulate({ proposalId, segmento: "AUTOS", tipoSimulacao: "valor_total", valor: 50000, objetivo: "contemplacao_rapida", lanceEmbutido: "nenhum" });
		const com = await gw.simulate({ proposalId, segmento: "AUTOS", tipoSimulacao: "valor_total", valor: 50000, objetivo: "contemplacao_rapida", lanceEmbutido: "30" });
		expect(com.offers[0].parcela).toBeGreaterThan(sem.offers[0].parcela);
	});

	it("forceOngoing → 409 OngoingProposalError, a menos que ignoreOngoingProposals", async () => {
		const gw = new MockProposalGateway({ forceOngoing: ["p-old-1", "p-old-2"] });
		await expect(gw.createProposal(baseProposal)).rejects.toBeInstanceOf(OngoingProposalError);
		const ok = await gw.createProposal({ ...baseProposal, ignoreOngoingProposals: true });
		expect(ok.proposalId).toBeTruthy();
	});

	it("simula por valor_parcela infere a carta", async () => {
		const gw = new MockProposalGateway();
		const { proposalId } = await gw.createProposal(baseProposal);
		const sim = await gw.simulate({ proposalId, segmento: "AUTOS", tipoSimulacao: "valor_parcela", valor: 800, objetivo: "contemplacao_rapida" });
		expect(sim.offers[0].valorCarta).toBeGreaterThan(40000); // 800 * ~80 meses
	});
});
