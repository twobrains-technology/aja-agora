// @vitest-environment happy-dom
/**
 * FIX-351 (topo de funil /kv) — os botões de cada card eram <button> sem
 * onClick. Cada card chama onOpenChat com o seed do tipo correspondente.
 *
 * O teste achava o botão pelo RÓTULO, que era diferente em cada card
 * ("Comparar opções", "Buscar alternativas", "Achar parcela perfeita"). Desde
 * que os três passaram a dizer a mesma coisa (Figma 924:4514, comentário #142),
 * o rótulo deixou de identificar o card — e um seletor que casa com três botões
 * de uma vez não prova nada sobre qual deles dispara qual seed.
 *
 * Agora o card é localizado pelo TÍTULO ("Carro", "Imóvel", "Moto"), que é o que
 * o visitante usa para escolher, e o botão é procurado dentro dele. Assim o
 * teste sobrevive à próxima troca de rótulo e passa a cobrir também a ligação
 * card→botão, que o seletor antigo assumia sem verificar.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

/** O <article> do card cujo <h3> é `titulo`. */
function card(titulo: string): HTMLElement {
	const heading = screen.getByRole("heading", { level: 3, name: titulo });
	const article = heading.closest("article");
	if (!article) throw new Error(`card "${titulo}" não está dentro de um <article>`);
	return article as HTMLElement;
}

describe("FIX-351 — KvTipos chama onOpenChat com o seed do tipo", () => {
	it.each([
		["Carro", "Quero comprar um carro."],
		["Imóvel", "Quero comprar um imóvel."],
		["Moto", "Quero comprar uma moto."],
	])("card %s → seed do tipo", (titulo, seed) => {
		const onOpenChat = vi.fn();
		render(<KvTipos onOpenChat={onOpenChat} />);

		fireEvent.click(within(card(titulo)).getByRole("button"));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe(seed);
	});
});
