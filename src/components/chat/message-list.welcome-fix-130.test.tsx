// @vitest-environment happy-dom
/**
 * FIX-130 (D21, continuação do FIX-121) — a PRIMEIRA tela do chat web (EmptyState,
 * renderizado quando `!hasMessages`) mostrava 4 categorias de entrada, incluindo
 * "Outros"/servicos, porque `message-list.tsx` tinha uma CÓPIA LOCAL de
 * `WELCOME_OPTIONS` com 4 itens. O FIX-121 corrigiu só a cópia do `web/adapter.ts`
 * (evento `welcome-categories`), deixando escapar o welcome inicial client-side.
 *
 * REGRA (jornada canônica, Passo 1 + regra-mãe de paridade): 3 categorias —
 * Imóvel, Automóvel, Moto — em paridade com WhatsApp e landing. `servicos` segue
 * VIVA no domínio (texto livre), só não é chip clicável de entrada.
 *
 * Este teste renderiza o welcome REAL que o usuário vê e falha ANTES do fix
 * (4 botões / "Outros" presente).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ conversationId: "conv-1", sendAction: vi.fn(), status: "ready" }),
}));

import { EmptyState } from "./message-list";

beforeEach(() => {
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("FIX-130 — welcome inicial do chat web (EmptyState) com 3 categorias", () => {
	it("NÃO mostra a categoria 'Outros' (servicos) nos chips de entrada", () => {
		render(<EmptyState />);
		expect(screen.queryByText("Outros")).toBeNull();
	});

	it("mostra exatamente 3 categorias clicáveis — Imóvel, Automóvel, Moto", () => {
		render(<EmptyState />);
		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(3);
		const labels = buttons.map((b) => b.textContent ?? "");
		expect(labels.some((t) => t.includes("Imóvel"))).toBe(true);
		expect(labels.some((t) => t.includes("Automóvel"))).toBe(true);
		expect(labels.some((t) => t.includes("Moto"))).toBe(true);
	});
});
