// @vitest-environment happy-dom
/**
 * O logo do cabeçalho leva para o início.
 *
 * Era um `<Wordmark>` solto — desenho, não link. Clicar nele não fazia nada, e
 * é o gesto mais automático que existe em site: o logo é o botão de "volta pro
 * começo" que ninguém precisa aprender. Pesa mais nas três landings de vertical
 * (`/autos`, `/imoveis`, `/motos`), onde era a única saída óbvia para a home e
 * ela não existia.
 *
 * O destino é `/` e não `#hero`: o mesmo cabeçalho renderiza nas quatro
 * páginas, e âncora resolveria na página atual — de `/motos`, um `#hero`
 * levaria ao topo de `/motos`, não ao início do site.
 */

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KvMenu } from "./kv-menu";
import { NAV_VERTICAL } from "./navegacao";

afterEach(() => {
	cleanup();
});

describe("KvMenu — o logo do cabeçalho volta para o início", () => {
	it("o logo é um link para /", () => {
		render(<KvMenu onOpenChat={vi.fn()} />);

		expect(screen.getByRole("link", { name: /aja agora/i })).toHaveAttribute("href", "/");
	});

	it("nas verticais também — é de lá que a volta para a home mais falta", () => {
		render(<KvMenu onOpenChat={vi.fn()} nav={NAV_VERTICAL} />);

		expect(screen.getByRole("link", { name: /aja agora/i })).toHaveAttribute("href", "/");
	});

	it("o nome acessível diz para onde vai, não só o que desenha", () => {
		// O SVG sozinho se anuncia como "Aja Agora", que descreve a imagem. Como
		// link, o que importa é o destino: sem isto o leitor de tela lê "Aja Agora,
		// link" e a pessoa tem de adivinhar se aquilo navega ou é a marca.
		render(<KvMenu onOpenChat={vi.fn()} />);

		expect(screen.getByRole("link", { name: /ir para o início/i })).toBeInTheDocument();
	});
});
