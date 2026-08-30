/**
 * O contrato NUNCA nasce no CPF da casa.
 *
 * Esta é a contrapartida obrigatória da vitrine, e o ponto onde a proposta
 * ingênua ("é só mandar um CPF fixo pra Bevi") vira prejuízo real: a vitrine
 * cria propostas na administradora com o par da casa, e a loja self-contract
 * opera sobre UMA proposta corrente por `storeHash` — `create-proposal` devolve
 * `400 Duplicated Hash` mesmo com `ignoreOngoingProposals: true`
 * (docs/integracoes/contas-teste-homologacao.md). O gateway do Trilho B trata
 * esse duplicado como RETOMADA e segue com a proposta ativa sem conferir de
 * quem ela é.
 *
 * Junte as duas coisas e o fecho do cliente retoma a proposta-vitrine: o RG e o
 * endereço dele entram numa proposta cujo CPF é o da casa, e a adesão é enviada
 * à administradora em nome da pessoa errada.
 *
 * Produção hoje roda `PROPOSAL_GATEWAY=bevi` (Trilho A), onde `startContract`
 * cria proposta própria com o CPF real — o desastre não está acontecendo. Mas o
 * caminho existe, é o default do código, e uma variável de ambiente separa um
 * do outro. Então o invariante vira código, não bilhete.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalGateway } from "@/lib/adapters/proposal-gateway";
import { ContratacaoComIdentidadeDeVitrineError, startContract } from "./fulfillment";

const CPF_VITRINE = "11144477735";
const CELULAR_VITRINE = "62992496793";
const CPF_CLIENTE = "52998224725";

const ENV_ORIGINAL = { ...process.env };

vi.mock("./proposal-repo", () => ({
	getLatestBeviProposal: vi.fn(async () => null),
	createBeviProposal: vi.fn(async () => undefined),
	updateBeviProposal: vi.fn(async () => undefined),
	relinkOrphanProposals: vi.fn(async () => undefined),
	isOfferFresh: vi.fn(() => true),
}));

function gatewayEspiao(): ProposalGateway & { criouCom: string[] } {
	const criouCom: string[] = [];
	return {
		criouCom,
		createProposal: vi.fn(async (input: { cpf: string }) => {
			criouCom.push(input.cpf);
			return { proposalId: "prop-1" };
		}),
		simulate: vi.fn(async () => ({ offers: [] })),
		chooseOffer: vi.fn(async () => ({})),
		getDocumentLinks: vi.fn(async () => ({})),
		finalize: vi.fn(async () => ({})),
	} as unknown as ProposalGateway & { criouCom: string[] };
}

const entradaBase = {
	celular: CELULAR_VITRINE,
	lgpd: true,
	segmento: "auto" as const,
	valor: 80_000,
	objetivo: "contemplacao_rapida" as const,
};

beforeEach(() => {
	process.env.VITRINE_CPF = CPF_VITRINE;
	process.env.VITRINE_CELULAR = CELULAR_VITRINE;
});

afterEach(() => {
	process.env = { ...ENV_ORIGINAL };
	vi.clearAllMocks();
});

describe("startContract — a vitrine não assina contrato", () => {
	it("RECUSA fechar com o CPF da casa, e não chega a tocar na administradora", async () => {
		const gateway = gatewayEspiao();

		await expect(
			startContract("conv-1", { ...entradaBase, cpf: CPF_VITRINE }, gateway),
		).rejects.toBeInstanceOf(ContratacaoComIdentidadeDeVitrineError);

		// O que importa não é só o erro: é que NENHUMA proposta foi criada. Uma
		// proposta real na Bevi consome o slot único da loja e dispara consulta
		// de bureau — o guard tem que barrar ANTES da chamada, não depois.
		expect(gateway.createProposal).not.toHaveBeenCalled();
		expect(gateway.criouCom).toEqual([]);
	});

	it("RECUSA mesmo com o CPF da casa formatado com pontos e traço", async () => {
		const gateway = gatewayEspiao();

		await expect(
			startContract("conv-1", { ...entradaBase, cpf: "111.444.777-35" }, gateway),
		).rejects.toBeInstanceOf(ContratacaoComIdentidadeDeVitrineError);
		expect(gateway.createProposal).not.toHaveBeenCalled();
	});

	it("DEIXA passar o CPF de um cliente real — a venda continua funcionando", async () => {
		const gateway = gatewayEspiao();

		await startContract("conv-1", { ...entradaBase, cpf: CPF_CLIENTE }, gateway);

		expect(gateway.criouCom).toEqual([CPF_CLIENTE]);
	});

	it("com a vitrine desligada, nenhum CPF é tratado como 'da casa'", async () => {
		// Modo de falha que este teste existe para impedir: um guard frouxo que,
		// sem env configurada, comparasse strings vazias e passasse a barrar
		// contratação legítima. Desligar a vitrine tem que devolver o
		// comportamento antigo inteiro, não meio.
		process.env.VITRINE_CPF = undefined;
		process.env.VITRINE_CELULAR = undefined;
		const gateway = gatewayEspiao();

		await startContract("conv-1", { ...entradaBase, cpf: CPF_VITRINE }, gateway);

		expect(gateway.criouCom).toEqual([CPF_VITRINE]);
	});
});
