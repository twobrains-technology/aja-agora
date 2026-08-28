// @vitest-environment happy-dom
/**
 * A faixa "O jeito independente de escolher consórcio" no rodapé (pedido do
 * cliente, 2026-08-20).
 *
 * A frase saiu da pílula do hero — lá ela parecia um botão e disputava o toque
 * com os CTAs de verdade — e foi parar aqui, logo acima da faixa navy. A posição
 * é o pedido, e é o que se perde primeiro quando alguém reorganiza o rodapé.
 *
 * Em 28/08 a faixa virou também o FECHO de conversão (Figma 731:6575,
 * comentário #145): o bloco "Busque a melhor alternativa", com os dois botões
 * que vinham antes dela, saiu, e sobrou um "Comparar agora" aqui dentro. O teste
 * de posição ancorava no texto daquele bloco; agora ancora na faixa navy abaixo,
 * que é o que o pedido de fato descreve.
 *
 * O outro caso é o que a mudança quase criou: a mesma frase já existia embaixo
 * do wordmark, dentro da faixa navy. Sem cuidado, a página passaria a mostrá-la
 * duas vezes com ~100px de distância — por isso a de lá saiu.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
	it("aparece logo acima da faixa navy", () => {
		const { container } = render(<KvFooter onOpenChat={vi.fn()} />);

		const rodape = container.querySelector("footer");
		const faixa = container.querySelector("section");
		const navy = rodape?.querySelector(".bg-\\[\\#021628\\]");

		expect(faixa).not.toBeNull();
		expect(navy).not.toBeNull();

		// `DOCUMENT_POSITION_FOLLOWING` = o argumento vem DEPOIS do nó.
		expect(
			(faixa as Node).compareDocumentPosition(navy as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("o fecho da página é UM CTA, e ele mora na faixa", () => {
		// Antes eram duas chamadas ("Fale com a AJA", "Encontre o consórcio certo")
		// num bloco próprio, mais a faixa sem botão — três alvos para a mesma
		// conversa nos últimos 300px. Repor qualquer um deles quebra isto.
		const { container } = render(<KvFooter onOpenChat={vi.fn()} />);
		const faixa = container.querySelector("section");

		expect(screen.queryByText(/Busque a melhor/i)).toBeNull();
		expect(screen.getAllByRole("button")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Comparar agora" })).toBe(
			faixa?.querySelector("button"),
		);
	});

	it("o CTA da faixa abre a conversa", () => {
		const onOpenChat = vi.fn();
		render(<KvFooter onOpenChat={onOpenChat} />);

		fireEvent.click(screen.getByRole("button", { name: "Comparar agora" }));

		expect(onOpenChat).toHaveBeenCalledTimes(1);
	});

	it("a frase aparece UMA vez — a linha embaixo do wordmark saiu", () => {
		const { container } = render(<KvFooter onOpenChat={vi.fn()} />);

		// A frase vivia também embaixo do wordmark, dentro da faixa navy. Com a
		// faixa logo acima, viravam duas ocorrências em ~100px — repetição que lê
		// como defeito de render, não como assinatura. Repor a de lá quebra isto.
		const achadas = ocorrencias(container);
		expect(achadas).toHaveLength(1);
		expect(achadas[0]?.closest("section")).not.toBeNull();
	});

	it("sem CTA final (política, termos, 404): a faixa vem, o botão não", () => {
		// `comCtaFinal={false}` é o rodapé das páginas de conformidade. A faixa
		// continua vindo: ela é assinatura de marca, não parte do funil de venda —
		// e é justamente a parte de funil (o botão) que precisa sumir. Desde que o
		// CTA passou a morar DENTRO da faixa, esconder um sem esconder o outro
		// virou possível, e é o que este caso trava.
		const { container } = render(<KvFooter onOpenChat={vi.fn()} comCtaFinal={false} />);

		expect(container.querySelector("section")).not.toBeNull();
		expect(ocorrencias(container)).toHaveLength(1);
		expect(screen.queryByRole("button", { name: "Comparar agora" })).toBeNull();
	});
});
