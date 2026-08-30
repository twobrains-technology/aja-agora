// @vitest-environment happy-dom
/**
 * A6 — o botão responde ao DEDO, não só ao mouse.
 *
 * A auditoria de 28/08 apontou "sem feedback visual ao toque" nos pills de
 * segmento. O problema é maior do que ela viu: até 30/08 **nenhum CTA do site
 * tinha estado `active:`**. O `KvCtaButton` trazia só `hover:brightness-110`, e
 * `hover` não existe em celular — ou seja, no aparelho onde está o tráfego pago
 * inteiro, todo botão da home era tocado sem devolver nenhum sinal.
 *
 * O sintoma disso já estava medido no nosso próprio mapa de calor: **15
 * `rage_click` sobre o hero no mobile** (produção, 18–30/08). `rage_click` é
 * literalmente "toquei e não aconteceu nada visível, então toquei de novo".
 *
 * O estado vive no ÁTOMO — que é a razão de o `KvCtaButton` existir: um lugar
 * só resolve as 8 seções que o usam, e a nona nasce corrigida.
 *
 * `prefers-reduced-motion` é respeitado sem perder o feedback: quem pede menos
 * movimento continua recebendo a mudança de brilho, que não é animação de
 * posição. Retirar o sinal inteiro de quem tem sensibilidade vestibular seria
 * trocar um problema de acessibilidade por outro.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KvCtaButton, kvCtaClass } from "./kv-cta-button";

afterEach(cleanup);

/** As classes efetivas do botão renderizado, sem depender da ordem em que saem. */
function classesDe(nome: string): string[] {
	return screen.getByRole("button", { name: nome }).className.split(/\s+/);
}

describe("A6 — feedback ao toque no átomo de CTA", () => {
	it("a variante primária escurece e encolhe ao ser pressionada", () => {
		render(<KvCtaButton>Comparar agora</KvCtaButton>);
		const classes = classesDe("Comparar agora");

		expect(classes).toContain("active:brightness-95");
		expect(classes).toContain("active:scale-[0.97]");
	});

	it("a variante de contorno também responde ao toque", () => {
		render(<KvCtaButton variant="outline">Comparar agora</KvCtaButton>);
		const classes = classesDe("Comparar agora");

		expect(classes).toContain("active:scale-[0.97]");
		// Contorno não tem brilho para escurecer: o sinal é a mesma inversão do
		// hover, que aqui passa a valer também no toque.
		expect(classes).toContain("active:bg-[#021628]");
		expect(classes).toContain("active:text-white");
	});

	it("a escala é a única coisa que some com prefers-reduced-motion", () => {
		const classes = kvCtaClass().split(/\s+/);

		expect(classes).toContain("motion-reduce:active:scale-100");
		// O brilho NÃO é neutralizado: mudança de cor não é movimento, e tirá-la
		// deixaria quem pede menos animação sem nenhum retorno de toque.
		expect(classes).not.toContain("motion-reduce:active:brightness-100");
	});

	it("a transição inclui transform — sem isso a escala sai seca", () => {
		// A lista era explícita (`filter,color,background-color`), então a escala
		// nova mudaria de valor sem transição nenhuma.
		expect(kvCtaClass()).toContain("transition-[filter,color,background-color,transform]");
	});

	it("o átomo se identifica para a varredura de rótulo (A5)", () => {
		render(<KvCtaButton>Comparar agora</KvCtaButton>);
		expect(screen.getByRole("button", { name: "Comparar agora" }).dataset.kvCta).toBe("");
	});

	it("classe extra do chamador não apaga o estado de toque", () => {
		render(<KvCtaButton className="mt-4 h-[58px] w-full">Comparar agora</KvCtaButton>);
		const classes = classesDe("Comparar agora");

		expect(classes).toContain("active:scale-[0.97]");
		expect(classes).toContain("mt-4");
	});

	it("`kvCtaClass` (usado pelas ÂNCORAS) carrega o mesmo estado", () => {
		// O "Voltar para o Início" do 404 é uma âncora e não um botão; sem isto ele
		// seria o único CTA do site sem retorno de toque.
		const classes = kvCtaClass({ variant: "primary" }).split(/\s+/);
		expect(classes).toContain("active:brightness-95");
		expect(classes).toContain("active:scale-[0.97]");
	});
});

describe("A6 — os blocos de segmento do hero", () => {
	it("os três blocos do card respondem ao toque", async () => {
		vi.doMock("next/image", () => ({
			default: () => null,
		}));
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

		const { KvHero } = await import("../kv-hero");
		render(<KvHero onOpenChat={() => {}} />);

		for (const rotulo of ["Imóvel", "Carro", "Moto"]) {
			const classes = screen.getByRole("button", { name: rotulo }).className.split(/\s+/);
			expect(classes).toContain("active:scale-[0.97]");
			expect(classes).toContain("active:border-[#F2404F]/40");
			expect(classes).toContain("motion-reduce:active:scale-100");
		}
	});
});
