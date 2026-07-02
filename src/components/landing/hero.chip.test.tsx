// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-75 (QA dono-de-produto 2026-07-02): o chip de categoria na
 * landing descartava o texto digitado. Cenário real: usuário digita "Quero
 * comprar um carro de uns R$ 70 mil, gastando perto de R$ 900 por mês." e
 * clica no chip Carro → o POST enviava o canned "Quero trocar de carro.",
 * jogando fora o orçamento digitado (confirmado na rede). Enviar SEM chip
 * preservava o texto íntegro.
 *
 * Root cause: hero.tsx:197 — o onClick do chip sempre chamava
 * onOpenChat(chip.fill, ...), ignorando o estado `value` do textbox.
 *
 * Decisão de UX (Kairo): texto do usuário VENCE. Chip com textbox vazio =
 * atalho canned; chip com texto = envia o texto digitado.
 */

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({
	motion: new Proxy(
		{},
		{
			get:
				(_target, tag) =>
				({ children, ...rest }: { children?: React.ReactNode }) => {
					const domProps = Object.fromEntries(
						Object.entries(rest).filter(
							([key]) => !["initial", "animate", "transition", "exit"].includes(key),
						),
					);
					// biome-ignore lint/suspicious/noExplicitAny: mock genérico de motion.*
					return createElement(tag as any, domProps, children);
				},
		},
	),
	useReducedMotion: () => false,
	useInView: () => true,
}));

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, priority, ...rest }: any) => createElement("img", rest),
}));

vi.mock("@/lib/hooks/use-reduced-motion", () => ({
	useReducedMotion: () => false,
}));

import { Hero } from "./hero";

const onOpenChat = vi.fn();

beforeEach(() => {
	onOpenChat.mockClear();
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("FIX-75 — chip do hero preserva texto digitado", () => {
	it("textbox VAZIO + clique no chip → envia o canned do chip", () => {
		render(<Hero onOpenChat={onOpenChat} />);
		fireEvent.click(screen.getByRole("button", { name: /carro/i }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe("Quero trocar de carro.");
	});

	it("textbox PREENCHIDO + clique no chip → envia o TEXTO DIGITADO, não o canned", () => {
		render(<Hero onOpenChat={onOpenChat} />);
		const input = screen.getByLabelText("Conte o que você quer conquistar");
		fireEvent.change(input, {
			target: { value: "Quero comprar um carro de uns R$ 70 mil, gastando perto de R$ 900 por mês." },
		});
		fireEvent.click(screen.getByRole("button", { name: /carro/i }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe(
			"Quero comprar um carro de uns R$ 70 mil, gastando perto de R$ 900 por mês.",
		);
		expect(onOpenChat.mock.calls[0][0]).not.toBe("Quero trocar de carro.");
	});

	it("textbox com só espaços em branco → conta como vazio, envia o canned", () => {
		render(<Hero onOpenChat={onOpenChat} />);
		const input = screen.getByLabelText("Conte o que você quer conquistar");
		fireEvent.change(input, { target: { value: "   " } });
		fireEvent.click(screen.getByRole("button", { name: /im[óo]vel/i }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero comprar um imóvel.");
	});
});
