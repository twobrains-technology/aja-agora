// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TopicPicker } from "./topic-picker";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

describe("TopicPicker — chips + voltar (bug #05)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("renderiza prompt opcional", () => {
		render(
			<TopicPicker
				payload={{
					prompt: "Sobre o que você gostaria de saber?",
					topics: ["Como funciona o lance?", "Parcelas"],
					includeBackButton: true,
				}}
			/>,
		);
		expect(screen.getByText(/sobre o que/i)).toBeDefined();
	});

	it("renderiza 3 chips clicáveis quando topics tem 3", () => {
		render(
			<TopicPicker
				payload={{
					topics: ["O que é lance?", "Como funcionam parcelas?", "Como funciona contemplação?"],
					includeBackButton: true,
				}}
			/>,
		);
		expect(screen.getByRole("button", { name: /lance/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /parcelas/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /contempla/i })).toBeDefined();
	});

	it("renderiza botão 'Voltar' quando includeBackButton=true", () => {
		render(<TopicPicker payload={{ topics: ["a", "b"], includeBackButton: true }} />);
		expect(screen.getByTestId("topic-picker-back")).toBeDefined();
	});

	it("NÃO renderiza 'Voltar' quando includeBackButton=false", () => {
		render(<TopicPicker payload={{ topics: ["a", "b"], includeBackButton: false }} />);
		expect(screen.queryByTestId("topic-picker-back")).toBeNull();
	});
});
