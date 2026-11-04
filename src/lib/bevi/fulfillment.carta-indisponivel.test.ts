// Carta vista indisponível NÃO gera proposta de outra carta — e também não apaga a oferta
// válida que a conversa já tinha. A linha de `bevi_proposals` é o que a mesa e o roteamento
// leem: gravar nulos por cima de uma oferta real some com a proposta.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartnerOffer, ProposalGateway } from "@/lib/adapters/proposal-gateway";
import { startContract } from "./fulfillment";

const { getLatest, criar, atualizar } = vi.hoisted(() => ({
	getLatest: vi.fn(),
	criar: vi.fn(async () => undefined),
	atualizar: vi.fn(async () => undefined),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("./proposal-repo", () => ({
	getLatestBeviProposal: getLatest,
	createBeviProposal: criar,
	updateBeviProposal: atualizar,
	isOfferFresh: vi.fn(() => true),
}));
vi.mock("../conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("../conversation/identity")>()),
	loadIdentity: vi.fn(async () => null),
}));

function oferta(quotaId: string, valorCarta: number): PartnerOffer {
	return {
		ofertaId: `oferta-${quotaId}`,
		quotaId,
		valorCarta,
		administradora: "CANOPUS",
		tipoOferta: "SPECIAL_OFFER",
		grupo: `grupo-${quotaId}`,
		parcela: 900,
		taxaContemplacao: 0.1,
		prazo: 100,
	};
}

const createProposal = vi.fn(async () => ({ proposalId: "nova" }));
const gateway = {
	createProposal,
	simulate: async () => ({
		simulationSessionId: "sim-2",
		expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
		offers: [oferta("outra", 76_000)],
	}),
} as unknown as ProposalGateway;

const ENTRADA = {
	cpf: "11144477735",
	celular: "11987654321",
	lgpd: true,
	segmento: "AUTOS",
	objetivo: "contemplacao_rapida" as const,
	valor: 80_000,
	quotaIdVista: "quota-vista",
};

beforeEach(() => vi.clearAllMocks());

describe("carta vista indisponível", () => {
	it("com proposta válida já gravada, a nova tentativa mantém a oferta (não grava nulos)", async () => {
		getLatest.mockResolvedValue({
			id: "linha-1",
			proposalId: "prop-1",
			proposalStatus: "simulacao",
			ofertaId: "oferta-valida",
		});
		const r = await startContract("conv-1", ENTRADA, gateway);
		expect(r.cartaVistaIndisponivel).toBe(true);
		expect(r.proposalId).toBe("prop-1"); // reaproveita, sem nova consulta de bureau
		expect(createProposal).not.toHaveBeenCalled();
		for (const [, patch] of atualizar.mock.calls as unknown as [
			string,
			Record<string, unknown>,
		][]) {
			expect(patch).not.toHaveProperty("ofertaId");
			expect(patch).not.toHaveProperty("administradora");
			expect(patch).not.toHaveProperty("creditValue");
		}
	});

	it("sem proposta anterior, grava a linha vazia só para reaproveitar o proposalId", async () => {
		getLatest.mockResolvedValue(null);
		await startContract("conv-1", ENTRADA, gateway);
		expect(criar).toHaveBeenCalledTimes(1);
		const snapshot = (criar.mock.calls[0] as unknown as [string, { ofertaId: unknown }])[1];
		expect(snapshot.ofertaId).toBeNull();
	});
});

describe("oferta de outra administradora nunca vira proposta nem fala de troca", () => {
	const gw = (admin: string) =>
		({
			createProposal,
			simulate: async () => ({
				simulationSessionId: "sim-3",
				expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
				offers: [{ ...oferta("quota-vista", 49_349), administradora: admin }],
			}),
		}) as unknown as ProposalGateway;

	it.each([
		["com quotaIdVista achada, mas de outra marca", { quotaIdVista: "quota-vista" }],
		["sem quotaIdVista (proximidade)", {}],
	])("%s: sem proposta, com alternativas", async (_n, extra) => {
		getLatest.mockResolvedValue(null);
		const r = await startContract(
			"conv-1",
			{ ...ENTRADA, quotaIdVista: undefined, ...extra, administradoraExibida: "ITAU" },
			gw("ANCORA"),
		);
		expect(r.offer).toBeNull();
		expect(r.cartaVistaIndisponivel).toBe(true);
		expect(r.alternativas?.length).toBeGreaterThan(0);
		expect(r.previousAdministradora ?? null).toBeNull();
		expect(criar).toHaveBeenCalledWith(
			"conv-1",
			expect.objectContaining({ ofertaId: null }),
			undefined,
		);
	});

	it("sem marca na tela, a proximidade segue e não anuncia troca", async () => {
		getLatest.mockResolvedValue(null);
		const r = await startContract("conv-1", { ...ENTRADA, quotaIdVista: undefined }, gw("ANCORA"));
		expect(r.offer?.administradora).toBeTruthy();
		expect(r.previousAdministradora ?? null).toBeNull();
		expect(r.cartaVistaIndisponivel).toBeFalsy();
	});
});
