import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("PROPOSAL_GATEWAY=mock é proibido em runtime", () => {
	const original = process.env.PROPOSAL_GATEWAY;

	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		if (original === undefined) delete process.env.PROPOSAL_GATEWAY;
		else process.env.PROPOSAL_GATEWAY = original;
	});

	it("lança erro contendo REMOVIDO", async () => {
		process.env.PROPOSAL_GATEWAY = "mock";
		const { getProposalGateway } = await import("./index");
		expect(() => getProposalGateway()).toThrow(/REMOVIDO/);
	});
});
