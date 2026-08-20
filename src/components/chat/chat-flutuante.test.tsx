// @vitest-environment happy-dom
/**
 * O botão flutuante do chat.
 *
 * Duas coisas o tornam útil ou inútil, e nenhuma delas é o desenho:
 *
 * 1. **ele abre a conversa de verdade.** Réplica visual inerte foi exatamente o
 *    defeito que o FIX-351 encontrou nos CTAs do hero — botão bonito que não
 *    chamava `onOpenChat`. Aqui a ligação é com o `TheaterProvider` real, e não
 *    com um mock: é a integração que interessa.
 * 2. **ele some com o teatro aberto.** Senão fica um alvo de toque atrás do
 *    scrim, e o morph de entrada sai de um elemento que está sumindo por baixo.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatFlutuante } from "./chat-flutuante";
import { TheaterProvider, useTheater } from "./theater/theater-context";

/** `useReducedMotion` consulta matchMedia; happy-dom nem sempre traz o método. */
function ambiente({ reduzido = false } = {}) {
	window.matchMedia = vi.fn().mockImplementation((query: string) => ({
		matches: query.includes("prefers-reduced-motion") ? reduzido : false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
	ambiente();
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function botao() {
	return screen.getByRole("button", { name: "Fale com a gente" });
}

/** Uma "rolada": o evento que o listener escuta. */
function rolar() {
	act(() => {
		window.dispatchEvent(new Event("scroll"));
	});
}

/** A tela sossega — o debounce fecha. */
function sossegar() {
	act(() => {
		vi.advanceTimersByTime(500);
	});
}

/** Mostra o estado do teatro sem montar o overlay inteiro (portal, FLIP, fontes). */
function Espiao() {
	const { isOpen, seed } = useTheater();
	return <output data-testid="espiao">{isOpen ? `aberto:${seed}` : "fechado"}</output>;
}

function montar() {
	return render(
		<TheaterProvider>
			<ChatFlutuante />
			<Espiao />
		</TheaterProvider>,
	);
}

describe("ChatFlutuante", () => {
	it("tocar abre o Modo Teatro com semente vazia (saudação)", () => {
		montar();

		fireEvent.click(screen.getByRole("button", { name: "Fale com a gente" }));

		expect(screen.getByTestId("espiao").textContent).toBe("aberto:");
	});

	it("some enquanto o teatro está aberto", () => {
		montar();

		expect(screen.queryByRole("button", { name: "Fale com a gente" })).not.toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Fale com a gente" }));

		expect(screen.queryByRole("button", { name: "Fale com a gente" })).toBeNull();
	});

	it("tem identidade estável para o mapa de calor", () => {
		// Ele vive fora de qualquer `[data-heat]`, então o caminho estrutural não
		// diria nada — sem este atributo o clique no botão mais visível do mobile
		// entra no painel como alvo anônimo.
		montar();

		expect(
			screen.getByRole("button", { name: "Fale com a gente" }).getAttribute("data-heat-id"),
		).toBe("chat-flutuante");
	});

	describe("o rótulo acompanha a rolagem", () => {
		it("com a tela parada, o rótulo está aberto", () => {
			montar();

			expect(botao().hasAttribute("data-recolhido")).toBe(false);
		});

		it("ao rolar, o rótulo recolhe — mas o botão continua clicável", () => {
			montar();

			rolar();

			expect(botao().hasAttribute("data-recolhido")).toBe(true);

			// O que recolhe é o RÓTULO. Sumir com o alvo no meio da rolagem seria
			// tirar a conversa da mão de quem está justamente procurando por ela.
			fireEvent.click(botao());
			expect(screen.getByTestId("espiao").textContent).toBe("aberto:");
		});

		it("quando a tela para, o rótulo volta", () => {
			montar();

			rolar();
			expect(botao().hasAttribute("data-recolhido")).toBe(true);

			sossegar();
			expect(botao().hasAttribute("data-recolhido")).toBe(false);
		});

		it("rolagem contínua segura o rótulo recolhido — não pisca entre eventos", () => {
			montar();

			// Cada evento empurra o prazo pra frente. Com throttle em vez de
			// debounce, o rótulo abriria e fecharia no meio da rolagem.
			for (let i = 0; i < 5; i += 1) {
				rolar();
				act(() => {
					vi.advanceTimersByTime(300);
				});
				expect(botao().hasAttribute("data-recolhido")).toBe(true);
			}

			sossegar();
			expect(botao().hasAttribute("data-recolhido")).toBe(false);
		});

		it("com prefers-reduced-motion o rótulo fica sempre aberto", () => {
			ambiente({ reduzido: true });
			montar();

			rolar();

			expect(botao().hasAttribute("data-recolhido")).toBe(false);
		});
	});
});
