// CASO RENAN — a carta que o cliente VIU (busca com o CPF da vitrine) não é
// necessariamente a que o fechamento abre (simulação com o CPF REAL).
//
// A fronteira é o `ProposalGateway` injetado em `startContract` (gateway falso):
// o catálogo devolvido por `simulate` é o do CPF real, que pode não ter a carta
// da vitrine. Os testes provam (1) o que o fechamento faz hoje e (2) o contrato
// que o fecho precisa: preferir a carta vista pelo id e, sem ela, DIZER.

import { describe, expect, it, vi } from "vitest";
import type { PartnerOffer, ProposalGateway } from "@/lib/adapters/proposal-gateway";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildStartContractInput } from "./contract-input";
import { startContract } from "./fulfillment";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("./proposal-repo", () => ({
	getLatestBeviProposal: vi.fn(async () => null),
	createBeviProposal: vi.fn(async () => undefined),
	updateBeviProposal: vi.fn(async () => undefined),
	isOfferFresh: vi.fn(() => true),
}));
vi.mock("../conversation/identity", async (importOriginal) => ({
	...(await importOriginal<typeof import("../conversation/identity")>()),
	loadIdentity: vi.fn(async () => null),
}));

const CPF_REAL = "11144477735";

function oferta(
	p: Partial<PartnerOffer> & Pick<PartnerOffer, "quotaId" | "valorCarta">,
): PartnerOffer {
	return {
		ofertaId: `oferta-${p.quotaId}`,
		administradora: "CANOPUS",
		tipoOferta: "SPECIAL_OFFER",
		grupo: `grupo-${p.quotaId}`,
		parcela: 977.12,
		taxaContemplacao: 0.1,
		prazo: 100,
		...p,
	};
}

function gatewayFalso(offers: PartnerOffer[]): ProposalGateway {
	return {
		createProposal: async () => ({ proposalId: "prop-cpf-real" }),
		simulate: async () => ({
			simulationSessionId: "sim-1",
			expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
			offers,
		}),
	} as unknown as ProposalGateway;
}

const ENTRADA = {
	cpf: CPF_REAL,
	celular: "11987654321",
	lgpd: true,
	segmento: "AUTOS",
	objetivo: "contemplacao_rapida" as const,
	valor: 80_000,
	valorVisto: 80_000,
	administradoraPreferida: "CANOPUS",
	administradoraExibida: "CANOPUS",
	prazoPreferido: 100,
};

describe("Renan — o catálogo do CPF real não tem a carta que o cliente viu", () => {
	// Catálogo do CPF real: a quota "vista" (80 mil) NÃO existe; há outra Canopus
	// 76 mil (5% abaixo — dentro da tolerância de 20% do portão do valor).
	const catalogoSemAVista = [
		oferta({ quotaId: "quota-outra-76", valorCarta: 76_000, parcela: 930.4 }),
		oferta({ quotaId: "quota-outra-60", valorCarta: 60_000, parcela: 700 }),
	];

	it("hoje: troca a carta em silêncio (nenhum aviso de divergência dispara)", async () => {
		const r = await startContract("conv-1", ENTRADA, gatewayFalso(catalogoSemAVista));
		expect(r.offer?.ofertaId).toBe("oferta-quota-outra-76"); // carta diferente da vista
		expect(r.valorDivergiu).toBe(false); // 5% < 20%
		expect(r.administradoraChanged).toBe(false); // mesma marca
	});

	it("com o id da carta vista e ela ausente do catálogo, o resultado DIZ", async () => {
		const r = await startContract(
			"conv-1",
			{ ...ENTRADA, quotaIdVista: "quota-vista-80" },
			gatewayFalso(catalogoSemAVista),
		);
		expect(r.cartaVistaIndisponivel).toBe(true);
	});
});

describe("Renan — a carta vista existe no catálogo do CPF real", () => {
	it("prefere a carta pelo id, não a mais próxima por valor", async () => {
		const catalogo = [
			oferta({ quotaId: "quota-mais-perto", valorCarta: 79_500, parcela: 960 }),
			oferta({ quotaId: "quota-vista-80", valorCarta: 80_000, parcela: 977.12, prazo: 120 }),
		];
		// Sem id a mais próxima (79,5k) ganha; com id, vale a que o cliente viu.
		const semId = await startContract(
			"conv-1",
			{ ...ENTRADA, prazoPreferido: 100 },
			gatewayFalso(catalogo),
		);
		expect(semId.offer?.ofertaId).toBe("oferta-quota-mais-perto");

		const comId = await startContract(
			"conv-1",
			{ ...ENTRADA, prazoPreferido: 100, quotaIdVista: "quota-vista-80" },
			gatewayFalso(catalogo),
		);
		expect(comId.offer?.ofertaId).toBe("oferta-quota-vista-80");
		expect(comId.cartaVistaIndisponivel).toBeFalsy();
	});
});

describe("Renan — o input do fechamento carrega o id da carta escolhida", () => {
	it("buildStartContractInput leva o groupId da contractOffer como quotaIdVista", () => {
		const meta = {
			currentCategory: "auto",
			qualifyAnswers: { creditMax: 80_000 },
			contractOffer: {
				groupId: "quota-vista-80",
				administradora: "CANOPUS",
				creditValue: 80_000,
				termMonths: 100,
				monthlyPayment: 977.12,
			},
		} as unknown as ConversationMetadata;

		const input = buildStartContractInput(meta, {
			cpf: CPF_REAL,
			celular: "11987654321",
			lgpd: true,
		});
		expect(input.quotaIdVista).toBe("quota-vista-80");
	});
});
