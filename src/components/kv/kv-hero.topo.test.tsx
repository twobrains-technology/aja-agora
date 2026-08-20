// @vitest-environment happy-dom
/**
 * O topo da home redesenhado (marcações do cliente, 2026-08-20).
 *
 * A pílula "o jeito independente" saiu, o parágrafo virou o trio
 * Imóvel/Carro/Moto, o card se apresenta como "Fale com a Aja" e o aviãozinho
 * virou "Quero minha simulação". Nasceu só no mobile e foi unificado em seguida
 * — hoje é UM desenho, nas duas larguras.
 *
 * O que estes casos protegem é a INTEGRAÇÃO: os elementos novos existem, têm
 * nome acessível PRÓPRIO (o trio não pode se chamar "Carro", que já é o chip do
 * card) e levam ao Modo Teatro com a semente certa. Um trio bonito e inerte
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
	// `useReducedMotion` consulta matchMedia; happy-dom nem sempre traz o método.
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
});

afterEach(() => {
	cleanup();
});

describe("KvHero — topo redesenhado", () => {
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

	it("a pílula 'o jeito independente' não está mais no hero", () => {
		// Ela parecia um botão e disputava o toque com os CTAs de verdade. A frase
		// virou assinatura de marca no rodapé (<KvIndependente/>) — repor aqui
		// desfaz a marcação do cliente e quebra isto.
		render(<KvHero onOpenChat={vi.fn()} />);

		expect(screen.queryByText(/jeito independente de escolher/i)).toBeNull();
	});
});
