// @vitest-environment happy-dom
/**
 * FIX-351 (topo de funil /kv) — os botões de cada card ("Compara opções",
 * "Buscar alternativas", "Simular ofertas") eram <button> sem onClick.
 * Cada card chama onOpenChat com o seed do tipo correspondente.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, ...rest }: any) => createElement("img", rest),
}));

import { KvTipos } from "./kv-tipos";

afterEach(() => {
	cleanup();
});

describe("FIX-351 — KvTipos chama onOpenChat com o seed do tipo", () => {
	it("card Carro → seed do carro", () => {
		const onOpenChat = vi.fn();
		render(<KvTipos onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Compara opções" }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe("Quero comprar um carro.");
	});

	it("card Imóvel → seed do imóvel", () => {
		const onOpenChat = vi.fn();
		render(<KvTipos onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Buscar alternativas" }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero comprar um imóvel.");
	});

	it("card Moto → seed da moto", () => {
		const onOpenChat = vi.fn();
		render(<KvTipos onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Simular ofertas" }));

		expect(onOpenChat.mock.calls[0][0]).toBe("Quero comprar uma moto.");
	});
});
