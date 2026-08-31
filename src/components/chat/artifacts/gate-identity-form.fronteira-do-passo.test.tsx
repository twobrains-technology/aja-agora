// @vitest-environment happy-dom
/**
 * O sinal que torna o C7 legível — a fronteira entre os dois passos.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * O C7 partiu o card de identidade em dois passos (celular → CPF+LGPD). O
 * critério de sucesso que o PRD declara para o bloco C é a taxa do gate
 * `identify`. Só que essa taxa é um número no FIM: ela conta quem entregou os
 * três dados. Um formulário em dois passos existe justamente para produzir o
 * número do MEIO — quem passou do primeiro degrau e desistiu no segundo — e sem
 * ele "a parede virou dois degraus e funcionou" e "o toque a mais custou" têm
 * exatamente o mesmo sintoma: a taxa mexeu.
 *
 * Agrava: C2 (garantia), C5 (autoridade) e C7 (dois passos) entraram na MESMA
 * janela, no MESMO card. A taxa do `identify` passou a medir as três de uma vez.
 * Esta é a única das três que deixa rastro próprio possível, e por isso é a que
 * tem de deixar.
 *
 * ── Por que `data-heat-id`, e não um score no Langfuse ──────────────────────
 *
 * O passo 1 → 2 é inteiramente do navegador: nenhum `POST /api/chat`, nenhum
 * turno, nenhum trace onde pendurar score. O `heatmap-tracker` já escuta todo
 * clique dentro do teatro e emite `chat_card_click` com o selector estável
 * (`selector.ts`: `data-heat-id` é o primeiro atributo da lista). Nomear os
 * botões faz o evento existir sem uma linha de código de coleta — e põe os três
 * pontos do funil do card na MESMA tabela (`page_events`), sem cruzar fonte.
 *
 * O que se lê depois, em uma consulta só:
 *   avancou / (conversas que chegaram ao gate)  → o primeiro degrau custou?
 *   enviou  / avancou                            → o segundo degrau custou?
 *   voltou                                       → o celular estava errado, ou
 *                                                  a pessoa hesitou no CPF
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

import { alvoDoClique, caminhoEstavel, ehSobreposto } from "@/lib/heatmap/selector";
import { GateIdentityForm } from "./gate-identity-form";

afterEach(cleanup);

describe("C7 — os três momentos do card têm nome próprio no mapa de calor", () => {
	it("o botão que cruza a fronteira 1 → 2 é identificável", () => {
		render(<GateIdentityForm />);
		expect(caminhoEstavel(screen.getByTestId("identify-avancar"))).toBe(
			"@data-heat-id=identify-passo-1-ok",
		);
	});

	it("o envio final também — sem ele não existe denominador do segundo degrau", () => {
		render(<GateIdentityForm prefilledPhone="11999998888" />);
		expect(caminhoEstavel(screen.getByTestId("identify-submit"))).toBe(
			"@data-heat-id=identify-envio",
		);
	});

	it("voltar para corrigir o celular é fricção, e fricção se mede", () => {
		// O botão só existe para quem PASSOU pelo passo 1 — quem chega pelo
		// WhatsApp começa no 2 e não tem para onde voltar (o celular é o `waId`).
		render(<GateIdentityForm />);
		fireEvent.change(screen.getByTestId("identify-phone"), {
			target: { value: "11999998888" },
		});
		fireEvent.click(screen.getByTestId("identify-avancar"));

		expect(caminhoEstavel(screen.getByTestId("identify-voltar"))).toBe(
			"@data-heat-id=identify-voltar-ao-passo-1",
		);
	});

	it("o card do HISTÓRICO não emite os mesmos nomes", () => {
		// Card antigo é registro inerte (FIX-381). Ele renderiza os dois passos de
		// uma vez, e um clique nele — que não faz nada — contaria como travessia
		// de fronteira que não houve, inflando o numerador do primeiro degrau.
		render(<GateIdentityForm active={false} />);
		const enviar = screen.getByTestId("identify-submit");
		expect(caminhoEstavel(enviar)).not.toBe("@data-heat-id=identify-envio");
	});
});

// ── O elo que faz o sinal EXISTIR ───────────────────────────────────────────
//
// Nomear o botão não basta. Entre o `data-heat-id` e a linha em `page_events`
// há uma cadeia que precisa fechar inteira, e ela vive fora deste componente:
//
//   1. o clique cai no `<span>` do rótulo, não no `<button>` → `alvoDoClique`
//      sobe até o elemento clicável;
//   2. `ehSobreposto` reconhece que o toque foi DENTRO do teatro (que é um
//      `role="dialog"`) e manda para `chatTocou` em vez de virar ponto no mapa
//      da página — o teatro é `fixed`, e a coordenada desenharia a batida sobre
//      uma seção que ninguém tocou;
//   3. `caminhoEstavel` resolve o alvo pelo `data-heat-id`.
//
// Se qualquer um dos três não fechar, o sinal não existe e NADA fica vermelho —
// é o mesmo no-op silencioso que a revisão desta branch encontrou no item A3,
// onde o cookie do carimbo não tinha teste e o item inteiro podia virar decoração.
describe("a cadeia até o evento, e não só o atributo", () => {
	it("clique no rótulo dentro do teatro chega como toque de card, com o nome certo", () => {
		const { container } = render(
			// O teatro real é `role="dialog"` (chat-theater.tsx). É esse atributo que
			// `ehSobreposto` procura.
			<div role="dialog">
				<GateIdentityForm />
			</div>,
		);

		const botao = screen.getByTestId("identify-avancar");
		// O que o navegador entrega é o nó mais interno — aqui, o texto do botão.
		const batido = botao.firstChild instanceof Element ? botao.firstChild : botao;

		const alvo = alvoDoClique(batido);
		expect(ehSobreposto(alvo)).toBe(true);
		expect(caminhoEstavel(alvo)).toBe("@data-heat-id=identify-passo-1-ok");
		expect(container.querySelector('[role="dialog"]')).toBeTruthy();
	});
});
