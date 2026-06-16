// @vitest-environment happy-dom
/**
 * FIX-51 — popup de retomada (Dialog do design system). Dá a escolha: "Voltar à
 * conversa" (hidrata) ou "Começar nova" (thread limpa, contato preservado). Cópia
 * PT-BR sem cara de IA (ADR Decisão 4).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumePrompt } from "./resume-prompt";

afterEach(cleanup);

describe("FIX-51 — ResumePrompt", () => {
	it("mostra o título e as DUAS ações (voltar/nova)", () => {
		render(<ResumePrompt onResume={vi.fn()} onFresh={vi.fn()} />);
		expect(screen.getByText(/Continuar de onde você parou/i)).toBeDefined();
		expect(screen.getByRole("button", { name: /Voltar à conversa/i })).toBeDefined();
		expect(screen.getByRole("button", { name: /Começar nova/i })).toBeDefined();
	});

	it("'Voltar à conversa' dispara onResume", () => {
		const onResume = vi.fn();
		render(<ResumePrompt onResume={onResume} onFresh={vi.fn()} />);
		fireEvent.click(screen.getByRole("button", { name: /Voltar à conversa/i }));
		expect(onResume).toHaveBeenCalledTimes(1);
	});

	it("'Começar nova' dispara onFresh", () => {
		const onFresh = vi.fn();
		render(<ResumePrompt onResume={vi.fn()} onFresh={onFresh} />);
		fireEvent.click(screen.getByRole("button", { name: /Começar nova/i }));
		expect(onFresh).toHaveBeenCalledTimes(1);
	});

	it("não mostra botão X de fechar (decisão é explícita: só voltar/nova)", () => {
		render(<ResumePrompt onResume={vi.fn()} onFresh={vi.fn()} />);
		expect(screen.queryByText("Close")).toBeNull();
	});
});
