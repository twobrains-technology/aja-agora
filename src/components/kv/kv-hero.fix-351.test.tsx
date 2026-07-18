// @vitest-environment happy-dom
/**
 * FIX-351 (topo de funil /kv) — os CTAs do Hero ("Fale com a AJA",
 * "Financiamento vs Consórcio") e o composer do search-card (chips +
 * "Enviar") eram inertes: réplica visual do Figma que nunca recebeu a
 * integração com o Modo Teatro (onOpenChat/TheaterOpener), no mesmo padrão
 * de src/components/landing/hero.tsx (FIX-75: texto digitado vence o chip).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, ...rest }: any) => createElement("img", rest),
}));

import { KvHero } from "./kv-hero";

afterEach(() => {
	cleanup();
});

describe("FIX-351 — KvHero chama onOpenChat", () => {
	it("clicar em 'Fale com a AJA' chama onOpenChat com seed vazio", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Fale com a AJA" }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe("");
	});

	it("clicar em 'Financiamento vs Consórcio' chama onOpenChat com seed vazio", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: /Financiamento.*Consórcio/ }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe("");
	});

	it("chip 'Carro' do search-card com input vazio → envia o canned do chip", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Carro" }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero comprar um carro.");
	});

	it("chip do search-card com input preenchido → envia o TEXTO DIGITADO, não o canned", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "Quero um carro até R$ 60 mil." } });
		fireEvent.click(screen.getByRole("button", { name: "Carro" }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero um carro até R$ 60 mil.");
	});

	it("'Enviar' do search-card submete o texto digitado", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, { target: { value: "Quero um apê de R$ 300 mil." } });
		fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero um apê de R$ 300 mil.");
	});
});
