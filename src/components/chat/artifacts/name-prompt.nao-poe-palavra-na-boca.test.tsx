// @vitest-environment happy-dom
/**
 * D1 (PRD 19/08/2026) — O CARD NÃO PÕE PALAVRA NA BOCA DO CLIENTE.
 *
 * O card do nome prefixa o que foi digitado com "Pode me chamar de …" antes de
 * mandar. Quando o conteúdo é um nome, isso é bom: a fala fica natural no
 * histórico. Quando NÃO é — e não é sempre, porque o campo aparece embaixo de
 * perguntas do agente sobre outros assuntos —, o prefixo transforma a resposta
 * dela numa frase que ela não disse:
 *
 *   agente: "Qual é o tipo de imóvel que você está buscando?"
 *   cliente digita no único campo da tela: "Casa em condomínio"
 *   histórico: "Pode me chamar de Casa em condominio"     ← ninguém disse isso
 *
 * Esse texto é o que o modelo lê no turno seguinte. Distorcer a intenção do
 * cliente na entrada é pior que perder o dado: o agente passa a conversar com
 * uma frase inventada.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendAction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction, status: "ready" }),
}));

const { NamePrompt } = await import("./name-prompt");

describe("NamePrompt — o rótulo respeita o que foi digitado", () => {
	beforeEach(() => {
		sendAction.mockClear();
		document.body.innerHTML = "";
	});

	function digitaEEnvia(texto: string) {
		render(<NamePrompt />);
		fireEvent.change(screen.getByTestId("name-input"), { target: { value: texto } });
		fireEvent.click(screen.getByTestId("name-submit"));
	}

	it("nome plausível ganha o prefixo natural", () => {
		digitaEEnvia("Rute");
		expect(sendAction).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "gate", gate: "name", value: { name: "Rute" } }),
			"Pode me chamar de Rute",
		);
	});

	it('"Casa em condomínio" vai como o cliente escreveu — sem prefixo inventado', () => {
		digitaEEnvia("Casa em condomínio");
		const [, label] = sendAction.mock.calls[0];
		expect(label).toBe("Casa em condomínio");
		expect(label).not.toContain("Pode me chamar");
	});

	it("valor do bem digitado no campo do nome também não vira apresentação", () => {
		digitaEEnvia("500 mil");
		const [, label] = sendAction.mock.calls[0];
		expect(label).toBe("500 mil");
	});
});
