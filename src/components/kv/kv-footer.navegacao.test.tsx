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

import { KvFooter } from "./kv-footer";
import { RODAPE_CONSORCIOS, RODAPE_NAVEGACAO } from "./navegacao";

afterEach(() => {
	cleanup();
});

/**
 * O perfil oficial, confirmado em 2026-08-16 — o que faltava para fechar o
 * FIX-353.
 *
 * Até aqui os ícones apontavam para `"#"`, atrás de uma constante nomeada
 * (`REDE_SOCIAL_PENDENTE`) que declarava a pendência em vez de escondê-la. A
 * constante sumiu junto com a espera: o rodapé não tem mais link morto nenhum,
 * e o teste acima não precisa de exceção.
 */
const PERFIS = [{ nome: "Instagram", url: "https://www.instagram.com/ajaagoraoficial" }];

describe("KvFooter — nenhum link morto", () => {
	it("nenhuma âncora do rodapé aponta para '#'", () => {
		render(<KvFooter onOpenChat={vi.fn()} />);

		const mortos = screen
			.getAllByRole("link")
			.filter((a) => a.getAttribute("href") === "#")
			.map((a) => a.textContent || a.getAttribute("aria-label"));

		expect(mortos).toEqual([]);
	});

	it.each(PERFIS)("$nome leva ao perfil oficial", ({ nome, url }) => {
		render(<KvFooter onOpenChat={vi.fn()} />);

		expect(screen.getByRole("link", { name: nome })).toHaveAttribute("href", url);
	});

	it("não mostra ícone de rede que não tem página", () => {
		// O Facebook saiu do rodapé em 2026-08-16: `facebook.com/ajaagoraoficial`
		// responde "Este conteúdo não está disponível no momento" mesmo para quem
		// está logado. Ícone que leva a uma página de erro da Meta é pior do que
		// ícone nenhum — e seria o mesmo defeito que este arquivo inteiro existe
		// para impedir, só que com outra cara. Volta quando a página existir; o
		// SVG está no histórico deste arquivo.
		render(<KvFooter onOpenChat={vi.fn()} />);

		expect(screen.queryByRole("link", { name: "Facebook" })).toBeNull();
	});

	it.each(PERFIS)("$nome abre em outra aba, sem levar a venda embora", ({ nome }) => {
		// A pessoa está no meio de um funil de venda. Trocar a página dela pelo
		// Instagram na MESMA aba é perder a conversa que estava acontecendo — e o
		// `rel` fecha a porta de a página de destino mexer nesta (`noopener`) e de
		// receber de onde ela veio (`noreferrer`).
		render(<KvFooter onOpenChat={vi.fn()} />);

		const link = screen.getByRole("link", { name: nome });
		expect(link).toHaveAttribute("target", "_blank");
		expect(link.getAttribute("rel")).toContain("noopener");
		expect(link.getAttribute("rel")).toContain("noreferrer");
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
