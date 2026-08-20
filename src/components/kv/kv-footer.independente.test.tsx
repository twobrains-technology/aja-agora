// @vitest-environment happy-dom
/**
 * A faixa "O jeito independente de escolher consórcio" no rodapé (pedido do
 * cliente, 2026-08-20).
 *
 * A frase saiu da pílula do hero no mobile — lá ela parecia um botão e disputava
 * o toque com os CTAs de verdade — e foi parar aqui, ENTRE o "Busque a melhor
 * alternativa" e a faixa navy. A posição é o pedido, e é o que se perde primeiro
 * quando alguém reorganiza o rodapé.
 *
 * O outro caso é o que a mudança quase criou: a mesma frase já existia embaixo
 * do wordmark, dentro da faixa navy. Sem cuidado, o celular passaria a mostrá-la
 * duas vezes com ~100px de distância.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KvFooter } from "./kv-footer";

afterEach(() => {
	cleanup();
});

const FRASE = /jeito independente de escolher consórcio/i;

/**
 * Elementos que dizem a frase, contando o texto de dentro dos filhos.
 *
 * `getAllByText` não serve aqui: o matcher padrão lê só os nós de texto DIRETOS
 * do elemento, e a faixa quebra a frase com `<Em>independente</Em>` — pra ele o
 * parágrafo diz "O jeito  de escolher consórcio" e não casa. Comparar
 * `textContent` é o que enxerga as duas.
 */
function ocorrencias(container: HTMLElement): HTMLParagraphElement[] {
	return Array.from(container.querySelectorAll("p")).filter((el) =>
		FRASE.test(el.textContent ?? ""),
	);
}

describe("faixa 'jeito independente' no rodapé", () => {
	it("aparece entre o 'Busque a melhor alternativa' e a faixa navy", () => {
		const { container } = render(<KvFooter onOpenChat={vi.fn()} />);

		const rodape = container.querySelector("footer");
		const cta = screen.getByText(/Busque a melhor/i);
		const faixa = container.querySelector("section");
		const navy = rodape?.querySelector(".bg-\\[\\#021628\\]");

		expect(faixa).not.toBeNull();
		expect(navy).not.toBeNull();

		// `DOCUMENT_POSITION_FOLLOWING` = o argumento vem DEPOIS do nó.
		expect(
			cta.compareDocumentPosition(faixa as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			(faixa as Node).compareDocumentPosition(navy as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("a frase é de UM breakpoint por vez — nunca duplicada na mesma tela", () => {
		const { container } = render(<KvFooter onOpenChat={vi.fn()} />);

		// happy-dom não aplica CSS, então as duas versões coexistem no DOM. O que
		// este caso trava é que cada uma leve o guarda do SEU lado: a da faixa some
		// no desktop, a do wordmark some no mobile. Tirar qualquer um dos dois faz
		// a frase aparecer repetida a ~100px de distância.
		const achadas = ocorrencias(container);
		expect(achadas).toHaveLength(2);

		const daFaixa = achadas.find((el) => el.closest("section"));
		const doWordmark = achadas.find((el) => !el.closest("section"));

		expect(daFaixa?.closest("section")?.className).toContain("md:hidden");
		expect(doWordmark?.className).toContain("hidden");
		expect(doWordmark?.className).toContain("md:block");
	});

	it("some no rodapé sem CTA final (política, termos) — nada muda ali", () => {
		// `comCtaFinal={false}` é o rodapé das páginas de conformidade. A faixa
		// continua vindo: ela é assinatura de marca, não parte do funil de venda.
		const { container } = render(<KvFooter onOpenChat={vi.fn()} comCtaFinal={false} />);

		expect(screen.queryByText(/Busque a melhor/i)).toBeNull();
		expect(container.querySelector("section")).not.toBeNull();
	});
});
