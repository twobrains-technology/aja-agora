import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BeviSelfContractProposalGateway } from "./bevi/bevi-self-contract-proposal-gateway";
import { getProposalGateway, resetGateway } from "./index";

// FIX-89 — seletor PROPOSAL_GATEWAY=selfcontract (fechamento via Trilho B,
// Trilho A travado sem prazo — docs/correcoes/decisions/2026-06-28-bloco-c-fechamento-trilho-b.md).
describe("getProposalGateway — seletor por env", () => {
	const prevGateway = process.env.PROPOSAL_GATEWAY;
	const prevHash = process.env.BEVI_SELFCONTRACT_HASH;

	beforeEach(() => {
		resetGateway();
		process.env.BEVI_SELFCONTRACT_HASH = "hash-teste-123";
	});
	afterEach(() => {
		resetGateway();
		if (prevGateway === undefined) delete process.env.PROPOSAL_GATEWAY;
		else process.env.PROPOSAL_GATEWAY = prevGateway;
		if (prevHash === undefined) delete process.env.BEVI_SELFCONTRACT_HASH;
		else process.env.BEVI_SELFCONTRACT_HASH = prevHash;
	});

	it('PROPOSAL_GATEWAY="selfcontract" resolve BeviSelfContractProposalGateway', () => {
		process.env.PROPOSAL_GATEWAY = "selfcontract";
		expect(getProposalGateway()).toBeInstanceOf(BeviSelfContractProposalGateway);
	});

	it("valor desconhecido continua lançando erro claro", () => {
		process.env.PROPOSAL_GATEWAY = "outrotrilho";
		expect(() => getProposalGateway()).toThrow(/Unknown gateway/);
	});
});
