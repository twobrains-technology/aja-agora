// @vitest-environment happy-dom

/**
 * FIX-37 (CSS puro) — o label "Quero falar com um especialista da Aja Agora"
 * transbordava pra fora do card (max-w-[340px]): os botões herdam
 * `whitespace-nowrap` da base do shadcn Button, então o label longo não quebrava
 * linha e o overflow do card cortava o texto ("...da Aja Agor").
 *
 * Fix: os botões do card permitem quebra de linha (`whitespace-normal` +
 * `h-auto`, mantendo `min-h-[44px]` de toque) — o label cabe quebrando em vez
 * de transbordar. Bug de CSS puro → cassette dispensado (component test basta).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DECISION_PROMPT_OPTIONS } from "@/lib/chat/types";
import { DecisionPrompt } from "./decision-prompt";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendAction: vi.fn(),
		sendUserMessage: vi.fn(),
		status: "ready",
	}),
}));

afterEach(() => cleanup());

describe("DecisionPrompt — FIX-37: label longo não transborda o card", () => {
	it("o botão do label mais longo quebra linha (whitespace-normal + h-auto) e mantém o alvo de toque", () => {
		render(<DecisionPrompt payload={{ administradora: "ITAÚ" }} />);
		const especialista = screen.getByTestId("decision-especialista");

		// O label canônico mais longo renderiza por completo (sem corte "Aja Agor").
		expect(especialista.textContent).toContain(
			"Quero falar com um especialista da Aja Agora",
		);

		// A correção: quebra de linha permitida (em vez do nowrap da base do shadcn),
		// altura automática pra crescer, e o min-h preservado pro toque (44px).
		expect(especialista.className).toContain("whitespace-normal");
		expect(especialista.className).toContain("h-auto");
		expect(especialista.className).toContain("min-h-[44px]");
		// cn() usa twMerge: whitespace-normal REMOVE o whitespace-nowrap da base —
		// é o que de fato deixa o texto quebrar. Sem isso, o overflow do card corta.
		expect(especialista.className).not.toContain("whitespace-nowrap");
	});

	it("as 3 opções canônicas renderizam com o label completo (sem corte)", () => {
		render(<DecisionPrompt payload={{}} />);
		for (const opt of DECISION_PROMPT_OPTIONS) {
			expect(screen.getByTestId(`decision-${opt.intent}`).textContent).toContain(opt.label);
		}
	});
});
