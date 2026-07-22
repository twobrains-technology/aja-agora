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
		// O título tem "parou" em <Em> (itálico de marca), então o texto fica quebrado
		// em dois nós — o matcher precisa olhar o conteúdo do elemento inteiro.
		expect(
			screen.getByText(
				(_, el) =>
					el?.tagName === "H2" && /Continuar de onde você parou\?/i.test(el.textContent ?? ""),
			),
		).toBeDefined();
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

	// BUG-RESUME-ATRAS-DO-THEATER (QA noturno E2E browser, 2026-06-21): o
	// ChatTheater é renderizado em z-[90] (chat-theater.tsx) e o ResumePrompt usa o
	// Dialog do design system, cujo popup é z-50. Resultado no browser: o palco
	// vazio do theater (z-90) COBRE o popup (z-50) → o usuário de retorno fica
	// preso num modal de chat vazio com spinner, sem conseguir clicar "Começar
	// nova"/"Voltar à conversa" (elementFromPoint no botão retornava a div do
	// theater). O design pretendido (theater-chat.tsx:112 "palco vazio atrás +
	// popup por cima") exige o popup ACIMA do theater.
	// Card: docs/correcoes/inbox/2026-06-21-resume-coberto-pelo-theater-zindex.md
	it("BUG-RESUME-ATRAS-DO-THEATER: o popup renderiza ACIMA do chat-theater (z-index > 90)", () => {
		render(<ResumePrompt onResume={vi.fn()} onFresh={vi.fn()} />);
		const content = document.querySelector('[data-slot="dialog-content"]');
		expect(content).not.toBeNull();
		// captura tanto `z-50` (default do Dialog) quanto `z-[110]` (override).
		const z = content?.className.match(/z-\[?(\d+)\]?/)?.[1];
		// o theater é z-[90]; o resume precisa ficar estritamente por cima.
		expect(Number(z)).toBeGreaterThan(90);
	});
});
