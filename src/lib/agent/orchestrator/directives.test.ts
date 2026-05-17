import { describe, expect, it } from "vitest";
import { buildTransitionFirstContactDirective } from "./directives";

describe("buildTransitionFirstContactDirective — nome capture", () => {
	it("inclui nameHint quando sistema sabe o nome do user", () => {
		const directive = buildTransitionFirstContactDirective(
			"Automóvel",
			"O usuario se chama Kairo, voce pode usar o primeiro nome.",
		);
		expect(directive).toContain("Kairo");
		expect(directive.toLowerCase()).not.toContain("pergunte o nome");
	});

	it("instrui agent a pedir nome quando nameHint vazio (PF-08)", () => {
		const directive = buildTransitionFirstContactDirective("Automóvel", "");
		expect(directive.toLowerCase()).toContain("nome");
		expect(directive.toLowerCase()).toMatch(/pergunte|peca|como.*chamar/i);
	});

	it("menciona categoria no directive", () => {
		const directive = buildTransitionFirstContactDirective("Imóvel", "");
		expect(directive).toContain("Imóvel");
	});
});
