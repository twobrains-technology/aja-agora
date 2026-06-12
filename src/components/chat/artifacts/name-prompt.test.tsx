// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-17: gate do nome em CARD com input focado (passo 1 da jornada
 * canônica, "Como posso te chamar?"). É a ÚNICA coleta texto-livre do funil —
 * todos os outros passos têm UI dedicada. Mobile-first (CLAUDE.md): o teclado
 * abre no lugar certo via autofocus, sem o usuário ter que tocar no input do
 * chat. Decisão do Kairo (2026-06-11): coexistência card/texto — o submit do
 * card e o texto livre convergem na persistência do nome.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendAction = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ conversationId: "conv-1", sendAction, status: "ready" }),
}));

import { NamePrompt } from "./name-prompt";

beforeEach(() => {
	sendAction.mockReset();
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("FIX-17 — NamePrompt", () => {
	it("renderiza o input de nome com FOCO automático quando ativo (mobile-first)", () => {
		render(<NamePrompt active />);
		const input = screen.getByTestId("name-input") as HTMLInputElement;
		expect(input).toBeDefined();
		// Autofocus: o input recebe foco no mount — no mobile o teclado já abre
		// no lugar certo (decisão do Kairo). Sem isso, o usuário precisa tocar.
		expect(document.activeElement).toBe(input);
	});

	it("card antigo (inativo) NÃO rouba o foco — some da tela como os demais gates", () => {
		render(<NamePrompt active={false} />);
		expect(screen.queryByTestId("name-input")).toBeNull();
	});

	it("submit envia action gate=name com o nome digitado", () => {
		render(<NamePrompt active />);
		fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Kairo" } });
		fireEvent.click(screen.getByTestId("name-submit"));
		expect(sendAction).toHaveBeenCalledTimes(1);
		const [action, label] = sendAction.mock.calls[0];
		expect(action.kind).toBe("gate");
		expect(action.gate).toBe("name");
		expect(action.value.name).toBe("Kairo");
		expect(typeof label).toBe("string");
		expect(label.length).toBeGreaterThan(0);
	});

	it("nome vazio (ou só espaços) → submit NÃO dispara action", () => {
		render(<NamePrompt active />);
		fireEvent.change(screen.getByTestId("name-input"), { target: { value: "   " } });
		fireEvent.click(screen.getByTestId("name-submit"));
		expect(sendAction).not.toHaveBeenCalled();
	});

	it("Enter no input também envia (atalho de teclado natural)", () => {
		render(<NamePrompt active />);
		const input = screen.getByTestId("name-input");
		fireEvent.change(input, { target: { value: "Marina" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(sendAction).toHaveBeenCalledTimes(1);
		expect(sendAction.mock.calls[0][0].value.name).toBe("Marina");
	});

	it("após submit, o card some (anti duplo-clique — botão deixa de existir)", () => {
		render(<NamePrompt active />);
		fireEvent.change(screen.getByTestId("name-input"), { target: { value: "Bruno" } });
		fireEvent.click(screen.getByTestId("name-submit"));
		expect(sendAction).toHaveBeenCalledTimes(1);
		// Pós-submit o componente retorna null — nenhum novo submit é possível.
		expect(screen.queryByTestId("name-submit")).toBeNull();
	});
});
