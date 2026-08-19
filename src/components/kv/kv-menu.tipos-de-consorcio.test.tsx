// @vitest-environment happy-dom
/**
 * O menu tem um item que ABRE — e o que ele abre são as três landings.
 *
 * O cliente reportou "não tá aparecendo os menus interativos": a barra tinha
 * quatro âncoras planas que só rolavam a página, nada que se desdobrasse, e as
 * verticais (`/autos`, `/imoveis`, `/motos`) não eram citadas em lugar nenhum
 * do site. As duas reclamações se resolvem no mesmo item.
 *
 * Quem desdobra é "Seu Objetivo" (decisão do Kairo, 19/08/2026). Antes eram
 * dois itens para a mesma pergunta: "Seu Objetivo" rolava até o hero e um
 * "Tipo de Consórcio" ao lado abria as verticais. Escolher o bem É o objetivo
 * de quem chega — o segundo item repetia a pergunta com outro nome e gastava
 * espaço da barra.
 *
 * O painel mobile também é coberto: abaixo de `lg` a barra inteira vira o
 * hambúrguer, e um submenu que existisse só no desktop deixaria o celular —
 * de onde vem a maior parte do tráfego de campanha — sem as verticais.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KvMenu } from "./kv-menu";
import { VERTICAIS } from "./navegacao";

afterEach(() => {
	cleanup();
});

describe("KvMenu — o item 'Seu Objetivo' abre as verticais", () => {
	it("o gatilho existe e anuncia que é expansível", () => {
		render(<KvMenu onOpenChat={vi.fn()} />);

		const gatilho = screen.getByRole("button", { name: /seu objetivo/i });

		expect(gatilho).toHaveAttribute("aria-expanded", "false");
	});

	it("clicar no gatilho revela um link por vertical", () => {
		render(<KvMenu onOpenChat={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: /seu objetivo/i }));

		for (const vertical of VERTICAIS) {
			expect(screen.getByRole("link", { name: vertical.label })).toHaveAttribute(
				"href",
				vertical.href,
			);
		}
	});

	it("clicar de novo fecha", () => {
		render(<KvMenu onOpenChat={vi.fn()} />);
		const gatilho = screen.getByRole("button", { name: /seu objetivo/i });

		fireEvent.click(gatilho);
		fireEvent.click(gatilho);

		expect(gatilho).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByRole("link", { name: "Carro" })).toBeNull();
	});

	it("Escape fecha e devolve o foco ao gatilho", () => {
		render(<KvMenu onOpenChat={vi.fn()} />);
		const gatilho = screen.getByRole("button", { name: /seu objetivo/i });

		fireEvent.click(gatilho);
		fireEvent.keyDown(gatilho, { key: "Escape" });

		expect(gatilho).toHaveAttribute("aria-expanded", "false");
		expect(document.activeElement).toBe(gatilho);
	});

	it("o painel mobile também traz as três verticais", () => {
		render(<KvMenu onOpenChat={vi.fn()} />);

		fireEvent.click(screen.getByRole("button", { name: /abrir menu/i }));
		const painel = document.getElementById("kv-menu-mobile-nav") as HTMLElement;

		for (const vertical of VERTICAIS) {
			expect(within(painel).getByRole("link", { name: vertical.label })).toHaveAttribute(
				"href",
				vertical.href,
			);
		}
	});
});
