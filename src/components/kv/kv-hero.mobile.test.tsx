// @vitest-environment happy-dom
/**
 * O topo da home no CELULAR (pedido do cliente, 2026-08-20).
 *
 * O hero passou a divergir do desktop abaixo de `md`: a pílula "o jeito
 * independente" saiu, o parágrafo virou o trio Imóvel/Carro/Moto, o card se
 * apresenta como "Fale com a Aja" e o aviãozinho virou "Quero minha simulação".
 *
 * O que estes casos protegem não é o CSS — `md:hidden` não existe em happy-dom,
 * e os dois lados convivem no DOM. É a INTEGRAÇÃO: os elementos novos existem,
 * têm nome acessível PRÓPRIO (o trio não pode se chamar "Carro", que já é o chip
 * do card) e levam ao Modo Teatro com a semente certa. Um trio bonito e inerte
 * foi exatamente o defeito que o FIX-351 encontrou nos CTAs.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, ...rest }: any) => createElement("img", rest),
}));

import { KvHero } from "./kv-hero";

beforeEach(() => {
	// Largura de celular: é o que `useIsMobile` lê (window.innerWidth < 768).
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: query.includes("max-width"),
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})) as unknown as typeof window.matchMedia;
	window.innerWidth = 390;
});

afterEach(() => {
	cleanup();
});

describe("KvHero no mobile", () => {
	it("o card se apresenta como 'Fale com a Aja' e diz o que fazer com os chips", () => {
		render(<KvHero onOpenChat={vi.fn()} />);

		expect(screen.getByText("Fale com a Aja")).toBeTruthy();
		expect(screen.getByText("Selecione o tipo de consórcio para comparar")).toBeTruthy();
	});

	it.each([
		["imóvel", "Quero comprar um imóvel."],
		["carro", "Quero comprar um carro."],
		["moto", "Quero comprar uma moto."],
	])("o trio '%s' abre o teatro com a semente da categoria", (categoria, semente) => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: `Consórcio de ${categoria}` }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe(semente);
		expect(onOpenChat.mock.calls[0][2]).toBe("chip");
	});

	it("o trio NÃO rouba o nome acessível dos chips do card", () => {
		render(<KvHero onOpenChat={vi.fn()} />);

		// Se o trio se chamasse "Carro", isto acharia dois e estouraria — e um
		// leitor de tela leria dois botões idênticos que fazem coisas parecidas
		// mas não iguais.
		expect(screen.getByRole("button", { name: "Carro" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Consórcio de carro" })).toBeTruthy();
	});

	it("'Quero minha simulação' submete o texto digitado", () => {
		const onOpenChat = vi.fn();
		render(<KvHero onOpenChat={onOpenChat} />);

		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "Quero uma moto de até R$ 400 por mês." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Quero minha simulação" }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
		expect(onOpenChat.mock.calls[0][0]).toBe("Quero uma moto de até R$ 400 por mês.");
	});

	it("o campo começa com uma das perguntas de exemplo no placeholder", () => {
		render(<KvHero onOpenChat={vi.fn()} />);

		// Sem timer avançado o placeholder é a frase 1 inteira (estado congelado);
		// o que importa aqui é que o campo nunca fica sem convite nenhum.
		expect(screen.getByRole("textbox").getAttribute("placeholder")).toBeTruthy();
	});
});
