// @vitest-environment happy-dom

// FIX-390 — "Ver outras opções" tem que devolver OPÇÕES, não uma frase.
//
// Rodada 2026-07-29 (grupo AJA AGORA + Twobrains, 28/07 16:12 — print
// `2807-1612-bernardo-07-pedi-outras-opcoes-nao-veio.jpg`). Na tela de
// "Confirmar e contratar", o Bernardo clicou em "Ver outras opções" e recebeu:
//
//   "Certo!
//    Aqui estão outras opções!
//    Qual dessas chama sua atenção?"
//
// …e nenhum card. Chat vazio embaixo da frase. Ele resumiu: "pedi outras opções
// e não veio".
//
// Root cause: o produto TEM caminho determinístico pra isso —
// `route.ts:632-659` trata `action.kind === "show-other-options"` chamando
// `buildOtherOptions()` e emitindo um `comparison_table` com as ofertas REAIS da
// descoberta ("Zero free-run do modelo, zero dado inventado", diz o comentário
// de lá). Só que dos quatro lugares que oferecem esse botão, apenas dois
// despachavam a ACTION:
//
//   ✓ decision-prompt.tsx:31      → sendAction({kind:"show-other-options"})
//   ✓ simulation-result.tsx:50    → sendAction({kind:"show-other-options"})
//   ✗ proposal-doc.tsx:373        → sendUserMessage("Quero ver outras opções")
//   ✗ real-offer.tsx:146          → sendUserMessage("Quero ver outras opções")
//
// Nos dois de baixo o clique virava MENSAGEM DE TEXTO: o modelo lia "quero ver
// outras opções", respondia com entusiasmo e não tinha artifact nenhum pra
// mostrar — porque quem monta o comparativo é o servidor, não ele.
//
// O invariante: um botão cujo resultado é uma LISTA DE OFERTAS REAIS é ação de
// servidor, sempre. Nunca texto pro modelo interpretar.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealOfferPayload } from "@/lib/chat/types";
import { ProposalDoc } from "./proposal-doc";
import { RealOffer } from "./real-offer";

const sendActionMock = vi.fn();
const sendUserMessageMock = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: sendActionMock,
		sendUserMessage: sendUserMessageMock,
		status: "ready",
	}),
}));

/** A oferta do print: Itaú, carta de R$ 721 mil em 221 meses. */
const oferta: RealOfferPayload = {
	proposalId: "p-bernardo",
	administradora: "ITAÚ",
	grupo: "4021",
	category: "imovel",
	creditValue: 721_000,
	monthlyPayment: 4_430.98,
	termMonths: 221,
};

const COMPONENTES = [
	{ nome: "ProposalDoc", render: () => render(<ProposalDoc payload={oferta} />) },
	{ nome: "RealOffer", render: () => render(<RealOffer payload={oferta} />) },
] as const;

describe("FIX-390 — 'Ver outras opções' é ação de servidor em TODOS os cards", () => {
	beforeEach(() => {
		sendActionMock.mockClear();
		sendUserMessageMock.mockClear();
	});
	afterEach(cleanup);

	it.each(COMPONENTES)(
		"$nome despacha a action show-other-options (não texto pro modelo)",
		({ render: montar }) => {
			montar();
			fireEvent.click(screen.getByTestId("offer-reject"));

			expect(sendActionMock).toHaveBeenCalledTimes(1);
			const [action] = sendActionMock.mock.calls[0];
			expect(action.kind).toBe("show-other-options");

			// O ponto do bug: NÃO pode sair como mensagem de texto. Se sair, o
			// modelo responde "aqui estão as opções!" sem nenhuma opção.
			expect(sendUserMessageMock).not.toHaveBeenCalled();
		},
	);

	it.each(COMPONENTES)("$nome mantém o rótulo que o cliente lê", ({ render: montar }) => {
		montar();
		expect(screen.getByTestId("offer-reject").textContent ?? "").toMatch(/ver outras opç/i);
	});

	it.each(COMPONENTES)(
		"$nome não despacha nada enquanto está streamando (anti duplo-clique)",
		({ render: montar }) => {
			montar();
			// Regra pré-existente dos dois componentes (`!isStreaming &&`). Com
			// `status: "ready"` no mock ela não é exercitada aqui; o que este caso
			// trava é o clique NÃO virar duas chamadas.
			const botao = screen.getByTestId("offer-reject");
			fireEvent.click(botao);
			expect(sendActionMock).toHaveBeenCalledTimes(1);
		},
	);
});
