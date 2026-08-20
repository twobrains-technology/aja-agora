// @vitest-environment happy-dom
/**
 * O botão flutuante do WhatsApp.
 *
 * Duas coisas o tornam útil ou inútil, e nenhuma delas é o desenho:
 *
 * 1. **ele leva para o WhatsApp de verdade.** Réplica visual inerte foi
 *    exatamente o defeito que o FIX-351 encontrou nos CTAs do hero. Desde
 *    20/08/2026 o destino é o `wa.me` do número oficial — o mesmo que o card de
 *    handoff usa —, e não mais o Modo Teatro: é o `href` que faz o celular
 *    abrir o app nativo, então é ele que este arquivo trava.
 * 2. **ele some com o teatro aberto.** Senão fica um alvo de toque atrás do
 *    scrim, e o morph de entrada sai de um elemento que está sumindo por baixo.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WHATSAPP_OFICIAL_DIGITOS } from "@/lib/bevi/closing-presentation";

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
	return screen.getByRole("link", { name: "Fale no WhatsApp" });
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

/**
 * Mostra o estado do teatro sem montar o overlay inteiro (portal, FLIP, fontes),
 * e dá um gatilho para abri-lo — o flutuante não abre mais o teatro, então sem
 * isto não haveria como pôr o componente no estado "teatro aberto".
 */
function Espiao() {
	const { isOpen, seed, openTheater } = useTheater();
	return (
		<>
			<output data-testid="espiao">{isOpen ? `aberto:${seed}` : "fechado"}</output>
			<button type="button" data-testid="abrir-teatro" onClick={() => openTheater("")}>
				abrir
			</button>
		</>
	);
}

function montar() {
	const utils = render(
		<TheaterProvider>
			<ChatFlutuante />
			<Espiao />
		</TheaterProvider>,
	);
	return {
		...utils,
		abrir: () => fireEvent.click(screen.getByTestId("abrir-teatro")),
	};
}

describe("ChatFlutuante", () => {
	it("aponta para o wa.me do número oficial, com a primeira fala pronta", () => {
		// O celular só abre o APP do WhatsApp por causa deste `href` — um
		// `onClick` que empurrasse o teatro no lugar deixaria o botão verde
		// mentindo sobre para onde leva. O número vem da MESMA constante do card
		// de handoff: dois números na página seriam dois atendimentos.
		montar();

		const href = botao().getAttribute("href") ?? "";

		expect(href.startsWith(`https://wa.me/${WHATSAPP_OFICIAL_DIGITOS}`)).toBe(true);
		expect(decodeURIComponent(href)).toContain("Oi! Quero comparar consórcios.");
		expect(botao().getAttribute("target")).toBe("_blank");
		// `noopener`: sem isto a aba do WhatsApp recebe `window.opener`.
		expect(botao().getAttribute("rel")).toContain("noopener");
	});

	it("é o glyph de marca do WhatsApp, e não um balão genérico", () => {
		// O verde só é reconhecível com o desenho certo dentro (mesma regra do
		// FIX-60, que trocou o `MessageSquare` pelo glyph nos outros cards).
		montar();

		expect(screen.getByTestId("whatsapp-icon")).not.toBeNull();
	});

	it("some enquanto o teatro está aberto", () => {
		// O teatro continua sendo aberto pelo hero e pelo fecho; o que este caso
		// trava é o flutuante não ficar vivo atrás do scrim.
		const { abrir } = montar();

		expect(screen.queryByRole("link", { name: "Fale no WhatsApp" })).not.toBeNull();

		abrir();

		expect(screen.queryByRole("link", { name: "Fale no WhatsApp" })).toBeNull();
	});

	it("tem identidade estável para o mapa de calor", () => {
		// Ele vive fora de qualquer `[data-heat]`, então o caminho estrutural não
		// diria nada — sem este atributo o clique no botão mais visível do mobile
		// entra no painel como alvo anônimo.
		montar();

		expect(botao().getAttribute("data-heat-id")).toBe("whatsapp-flutuante");
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
			expect(botao().getAttribute("href")).toContain("wa.me");
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
