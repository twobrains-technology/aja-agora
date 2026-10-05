// @vitest-environment happy-dom
// B5 — o banner de erro do chat mostra português, nunca o código cru.
//
// O `ChatLayout` recebia o `error.message` do servidor e o imprimia como veio
// (inglês do gateway). Agora recebe um CÓDIGO e traduz — este teste prova a
// tradução na tela, que é o que o cliente vê.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import { ChatLayout } from "./chat-layout";
import { TEXTO_ERRO_DO_CHAT } from "@/lib/chat/stream-error";

afterEach(() => {
	cleanup();
});

describe("ChatLayout — banner de erro em português", () => {
	it("código de billing vira o texto em português e não mostra o código", () => {
		render(
			<ChatLayout error="llm_billing">
				<span>conversa</span>
			</ChatLayout>,
		);

		expect(screen.getByText(TEXTO_ERRO_DO_CHAT.llm_billing)).toBeTruthy();
		expect(screen.queryByText("llm_billing")).toBeNull();
	});

	it("código desconhecido cai no genérico em português", () => {
		render(
			<ChatLayout error="codigo_estranho">
				<span>conversa</span>
			</ChatLayout>,
		);

		expect(screen.getByText(TEXTO_ERRO_DO_CHAT.erro_interno)).toBeTruthy();
		expect(screen.queryByText("codigo_estranho")).toBeNull();
	});

	it("sem erro não há banner", () => {
		render(
			<ChatLayout error={null}>
				<span>conversa</span>
			</ChatLayout>,
		);

		expect(screen.queryByLabelText("Fechar erro")).toBeNull();
	});
});