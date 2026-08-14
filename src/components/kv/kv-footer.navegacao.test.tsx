// @vitest-environment happy-dom
/**
 * O rodapé oferece links que levam a algum lugar.
 *
 * Eram cinco `href="#"` — "Encontre o consórcio certo", "Como funcionamos",
 * "Tipo de Consórcio", "Dúvidas", "Jornada" — todos inertes ao clique. Foi a
 * parte mais literal da reclamação do cliente: link que existe, é clicável, e
 * não faz nada.
 *
 * "Recursos" virou "Consórcios": "Jornada" e "Como funcionamos" cairiam na
 * mesma seção da home, e a coluna rende muito mais apontando para as três
 * landings de vertical, que é o que o cliente pediu.
 *
 * `navegacao.rotas-existem.test.ts` já cobra que cada destino existe. Aqui é o
 * outro lado: que o rodapé de fato RENDERIZA o que aquele módulo declara, em
 * vez de manter a lista antiga por conta própria.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KvFooter, REDE_SOCIAL_PENDENTE } from "./kv-footer";
import { RODAPE_CONSORCIOS, RODAPE_NAVEGACAO } from "./navegacao";

afterEach(() => {
	cleanup();
});

/** Os ícones de rede social, que ainda esperam a URL do operador (FIX-353). */
const PENDENTES = new Set(["Instagram", "Facebook"]);

describe("KvFooter — nenhum link morto", () => {
	it("nenhuma âncora do rodapé aponta para '#'", () => {
		render(<KvFooter onOpenChat={vi.fn()} />);

		const mortos = screen
			.getAllByRole("link")
			.filter((a) => a.getAttribute("href") === "#")
			.map((a) => a.textContent || a.getAttribute("aria-label"))
			.filter((nome) => !PENDENTES.has(nome ?? ""));

		expect(mortos).toEqual([]);
	});

	it("as redes sociais são a ÚNICA pendência, e declarada", () => {
		// Se alguém trocar o placeholder por um "#" solto em outro lugar, o teste
		// acima pega. Este garante que a exceção acima continua sendo exceção: o
		// dia em que as URLs chegarem, a constante some e este teste cai junto.
		expect(REDE_SOCIAL_PENDENTE).toBe("#");

		render(<KvFooter onOpenChat={vi.fn()} />);

		for (const nome of PENDENTES) {
			expect(screen.getByRole("link", { name: nome })).toHaveAttribute(
				"href",
				REDE_SOCIAL_PENDENTE,
			);
		}
	});

	it.each(RODAPE_NAVEGACAO)("coluna Navegação: $label → $href", ({ label, href }) => {
		render(<KvFooter onOpenChat={vi.fn()} />);

		expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
	});

	it.each(RODAPE_CONSORCIOS)("coluna Consórcios: $label → $href", ({ label, href }) => {
		render(<KvFooter onOpenChat={vi.fn()} />);

		expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
	});

	it("a coluna se chama Consórcios", () => {
		render(<KvFooter onOpenChat={vi.fn()} />);

		expect(screen.getByRole("navigation", { name: "Consórcios" })).toBeInTheDocument();
	});
});
