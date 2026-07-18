// @vitest-environment happy-dom
/**
 * FIX-353 — kv-faq.tsx já tinha o accordion funcional (useState + onClick),
 * só faltava cobertura de regressão. Não mexe na lógica, só confirma o
 * comportamento: um item fechado abre ao clicar, um item aberto fecha ao
 * clicar de novo, e só um item fica aberto por vez.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KvFaq } from "./kv-faq";

afterEach(() => {
	cleanup();
});

describe("FIX-353 — accordion de Perguntas Frequentes", () => {
	it("item fechado por padrão: clicar abre e expõe a resposta", () => {
		render(<KvFaq />);

		const trigger = screen.getByRole("button", { name: /consórcio é seguro/i });
		expect(trigger).toHaveAttribute("aria-expanded", "false");

		fireEvent.click(trigger);

		expect(trigger).toHaveAttribute("aria-expanded", "true");
	});

	it("item aberto: clicar de novo fecha", () => {
		render(<KvFaq />);

		const trigger = screen.getByRole("button", { name: /consórcio é seguro/i });
		fireEvent.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "true");

		fireEvent.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "false");
	});

	it("abrir um item fecha o item anteriormente aberto (só um por vez)", () => {
		render(<KvFaq />);

		const first = screen.getByRole("button", { name: /consórcio é seguro/i });
		const second = screen.getByRole("button", { name: /quanto tempo demora/i });

		fireEvent.click(first);
		expect(first).toHaveAttribute("aria-expanded", "true");

		fireEvent.click(second);
		expect(second).toHaveAttribute("aria-expanded", "true");
		expect(first).toHaveAttribute("aria-expanded", "false");
	});
});
