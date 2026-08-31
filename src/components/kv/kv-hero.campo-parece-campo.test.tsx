// @vitest-environment happy-dom
/**
 * A1 — o campo do hero precisa PARECER um campo.
 *
 * A auditoria de 28/08 descreveu um texto que não se apresenta como área de
 * digitação: sem borda, sem cursor de texto, sem foco visível. Metade do item
 * já tinha caído em 20/08, quando o aviãozinho de 37px virou o botão de 58px de
 * largura total — mas o CAMPO continuou `bg-transparent outline-none`.
 *
 * O que sinalizava "isto é editável" era só o placeholder que se digita sozinho
 * (`usePlaceholderDigitando`). É bonito e não é affordance: texto animado
 * também aparece em banner, e ninguém tenta digitar dentro de um banner.
 *
 * **O dado que fecha o diagnóstico** (produção, 16–30/08): das 75 aberturas do
 * teatro medidas no mapa de calor, só **4** vieram com semente `digitada` — 37
 * vieram de chip e 34 vazias. O campo do hero recebeu 12 cliques no período,
 * contra 44 nos três blocos de categoria logo abaixo dele. Não é que as pessoas
 * prefiram o chip: é que o campo não se oferece.
 *
 * A moldura reusa a do formulário de identidade do chat
 * (`gate-identity-form.tsx`) em vez de inventar uma nova — o site e o chat
 * passam a dizer "aqui se digita" do mesmo jeito, e mexer no token muda os
 * dois juntos.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: mock simples de next/image pro teste
	default: ({ fill, priority, quality, ...rest }: any) => createElement("img", rest),
}));

import { KvHero } from "./kv-hero";

beforeEach(() => {
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

afterEach(cleanup);

const campo = () => screen.getByLabelText("O que você está buscando?");

describe("A1 — affordance do campo do hero", () => {
	it("tem moldura: borda, raio e fundo de campo", () => {
		render(<KvHero onOpenChat={() => {}} />);
		const classes = campo().className.split(/\s+/);

		expect(classes).toContain("border");
		expect(classes).toContain("border-input");
		expect(classes).toContain("rounded-xl");
		// `bg-transparent` era o que fazia o campo se dissolver no cartão branco.
		expect(classes).not.toContain("bg-transparent");
	});

	it("tem cursor de texto — o ponteiro conta a mesma história que a borda", () => {
		render(<KvHero onOpenChat={() => {}} />);
		expect(campo().className.split(/\s+/)).toContain("cursor-text");
	});

	it("o foco é visível, com o mesmo anel do formulário do chat", () => {
		render(<KvHero onOpenChat={() => {}} />);
		const classes = campo().className.split(/\s+/);

		expect(classes).toContain("focus:border-[var(--ring)]");
		expect(classes).toContain("focus:shadow-[var(--shadow-focus)]");
		// `outline-none` sozinho é o anti-padrão de acessibilidade: só pode existir
		// quando alguma outra coisa desenha o foco — que é o caso agora.
		expect(classes).toContain("outline-none");
	});

	it("continua sendo um campo de verdade: digitar e enviar leva o texto ao teatro", () => {
		const abriu = vi.fn();
		render(<KvHero onOpenChat={abriu} />);

		fireEvent.change(campo(), { target: { value: "Quero um carro de 90 mil" } });
		fireEvent.click(screen.getByRole("button", { name: "Quero minha simulação" }));

		expect(abriu).toHaveBeenCalledWith("Quero um carro de 90 mil", expect.anything());
	});

	it("o placeholder que digita sozinho sobreviveu à moldura", () => {
		render(<KvHero onOpenChat={() => {}} />);
		// Ele começa vazio e vai sendo escrito por um timer; o que importa aqui é
		// que o atributo continua sendo governado pelo hook, não fixado no JSX.
		expect(campo().getAttribute("placeholder")).not.toBeNull();
	});
});
