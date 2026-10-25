// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealOfferPayload } from "@/lib/chat/types";
import type { AjaUIMessage } from "@/lib/chat/ui-message";

const ctx = vi.hoisted(() => ({
	sendAction: vi.fn(),
	status: "ready" as "ready" | "submitted" | "streaming" | "error",
	messages: [] as AjaUIMessage[],
}));

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: ctx.sendAction,
		status: ctx.status,
		messages: ctx.messages,
	}),
}));

import { RealOffer } from "./real-offer";

beforeEach(() => {
	ctx.sendAction.mockReset();
	ctx.status = "ready";
	ctx.messages = [];
});

afterEach(cleanup);

const PAYLOAD: RealOfferPayload = {
	proposalId: "p1",
	administradora: "ITAU",
	grupo: "1234",
	category: "auto",
	creditValue: 60_000,
	monthlyPayment: 1_200,
	termMonths: 80,
};

function assistant(texto: string, id = "m-resposta"): AjaUIMessage {
	return {
		id,
		role: "assistant",
		parts: [{ type: "text", text: texto }],
	} as unknown as AjaUIMessage;
}

function fecho(): AjaUIMessage {
	return {
		id: "m-fecho",
		role: "assistant",
		parts: [{ type: "data-artifact", data: { type: "signature_handoff", payload: {} } }],
	} as unknown as AjaUIMessage;
}

describe("Card oferta real — o clique em “Confirmar e contratar” não fica preso (P144/P292)", () => {
	// O caminho real do endpoint: o `offer-confirm` que falha volta como TEXTO
	// normal ("Pode tentar confirmar de novo?"), o stream acaba e a promessa
	// resolve. O card tem de devolver o clique — era o comportamento da main
	// (`real-offer.tsx`, que só dependia de `isStreaming`).
	it("devolve o clique quando o turno acaba sem fechar o contrato", () => {
		ctx.sendAction.mockImplementation(() => new Promise<void>(() => {}));

		const view = render(<RealOffer payload={PAYLOAD} />);
		const botao = screen.getByTestId("offer-confirm") as HTMLButtonElement;
		fireEvent.click(botao);

		ctx.status = "streaming";
		view.rerender(<RealOffer payload={PAYLOAD} />);

		ctx.messages = [
			assistant("Tive um problema ao gerar sua proposta. Pode tentar confirmar de novo?"),
		];
		ctx.status = "ready";
		view.rerender(<RealOffer payload={PAYLOAD} />);

		expect(botao.textContent).toContain("Confirmar e contratar");
		expect(botao.disabled).toBe(false);
	});

	it("com o contrato fechado, o card mostra a confirmação e não oferece outro pedido", () => {
		ctx.sendAction.mockImplementation(() => new Promise<void>(() => {}));

		const view = render(<RealOffer payload={PAYLOAD} />);
		const botao = screen.getByTestId("offer-confirm") as HTMLButtonElement;
		fireEvent.click(botao);

		ctx.status = "streaming";
		view.rerender(<RealOffer payload={PAYLOAD} />);

		ctx.messages = [assistant("Sua cota está reservada."), fecho()];
		ctx.status = "ready";
		view.rerender(<RealOffer payload={PAYLOAD} />);

		expect(botao.textContent).toContain("Proposta confirmada");
		expect(botao.disabled).toBe(true);
	});
});
