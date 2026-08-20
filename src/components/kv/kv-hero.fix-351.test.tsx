// @vitest-environment happy-dom
/**
 * FIX-351 (topo de funil /kv) — os CTAs do Hero ("Fale com a AJA",
 * "Encontre o consórcio certo") e o composer do search-card (chips +
 * "Enviar") eram inertes: réplica visual do Figma que nunca recebeu a
 * integração com o Modo Teatro (onOpenChat/TheaterOpener), no mesmo padrão
 * de src/components/landing/hero.tsx (FIX-75: texto digitado vence o chip).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, ...rest }: any) => createElement("img", rest),
}));

import { KvHero } from "./kv-hero";

// O hero passou a consultar `matchMedia` (useIsMobile / useReducedMotion, para o
// placeholder que se digita sozinho no mobile). happy-dom nem sempre traz o
// método; sem o stub o componente quebra na montagem e TODO caso aqui falha por
// um motivo que nada tem a ver com o que eles medem.
//
// `matches: false` + largura de desktop: estes casos são os do comp de 1440,
// onde a pílula, o aviãozinho e os dois CTAs continuam valendo. O mobile tem
// arquivo próprio (kv-hero.mobile.test.tsx).
beforeEach(() => {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})) as unknown as typeof window.matchMedia;
	window.innerWidth = 1440;
});

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

	it("clicar em 'Encontre o consórcio certo' chama onOpenChat com seed vazio", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Encontre o consórcio certo" }));

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
