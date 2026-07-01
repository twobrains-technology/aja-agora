// @vitest-environment happy-dom
// FIX-32 (bloco-r) — o auto-scroll brigava com o usuário: `|| isStreaming` no
// effect forçava o fundo a cada token mesmo com o usuário rolando pra cima
// ("buga tudo"). Regra de produto (palavras do operador): o GESTO do usuário
// SEMPRE vence; sticky-to-bottom só quando ele não interage; pill religa.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { MessageList } from "./message-list";

// FIX-111: o auto-scroll agora é coalescido num requestAnimationFrame (1 scroll
// por frame em vez de 1 por token). Os asserts de "acompanhou o fundo" precisam
// liberar o frame pendente antes de checar o scrollIntoView.
async function flushFrame(): Promise<void> {
	await act(async () => {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	});
}

// Stubs de apresentação — o SUT é a lógica de scroll/intenção do MessageList,
// não o render das bolhas (que puxa motion/artifacts pesados).
vi.mock("./chat-message", () => ({
	ChatMessage: ({ message }: { message: { id: string } }) => (
		<div data-testid={`msg-${message.id}`} />
	),
	AssistantAvatar: () => <div />,
}));
vi.mock("./artifacts/welcome-categories", () => ({
	WelcomeCategories: () => <div />,
}));

function msg(id: string, text: string, role: "user" | "assistant" = "assistant"): AjaUIMessage {
	return { id, role, parts: [{ type: "text", text }] } as AjaUIMessage;
}

function resumedMsg(
	id: string,
	text: string,
	role: "user" | "assistant" = "assistant",
): AjaUIMessage {
	return { id, role, parts: [{ type: "text", text }], metadata: { resumed: true } } as AjaUIMessage;
}

function container(): Element {
	const el = document.querySelector("[data-message-list]");
	if (!el) throw new Error("scroll container não encontrado");
	return el;
}

describe("FIX-32 — scroll inteligente (gesto do usuário vence)", () => {
	let scrollSpy: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		scrollSpy = vi.fn();
		// happy-dom não implementa scrollIntoView
		Element.prototype.scrollIntoView =
			scrollSpy as unknown as typeof Element.prototype.scrollIntoView;
	});
	afterEach(() => {
		// vitest globals:false → sem auto-cleanup; sem isto os MessageList de cada
		// teste acumulam no DOM e container() pega o do teste anterior.
		cleanup();
		vi.clearAllMocks();
	});

	it("no fundo + mensagem nova → acompanha (scrollIntoView chamado)", async () => {
		const { rerender } = render(<MessageList messages={[msg("a", "oi")]} isStreaming={false} />);
		await flushFrame();
		scrollSpy.mockClear();
		rerender(<MessageList messages={[msg("a", "oi"), msg("b", "resposta")]} isStreaming={false} />);
		await flushFrame();
		expect(scrollSpy).toHaveBeenCalled();
	});

	it("gesto de subir DURANTE streaming desliga o auto-scroll (não arranca o scroll da mão)", () => {
		const { rerender } = render(<MessageList messages={[msg("a", "oi")]} isStreaming={true} />);
		fireEvent.wheel(container(), { deltaY: -40 }); // usuário rola pra cima
		scrollSpy.mockClear();
		// chega mais conteúdo durante o streaming
		rerender(<MessageList messages={[msg("a", "oi"), msg("b", "token")]} isStreaming={true} />);
		expect(scrollSpy).not.toHaveBeenCalled();
	});

	it("FIX-49: histórico hidratado mostra a âncora 'Você voltou — continue de onde parou'", () => {
		render(
			<MessageList
				messages={[resumedMsg("a", "oi"), resumedMsg("b", "resposta antiga")]}
				isStreaming={false}
			/>,
		);
		expect(screen.getByTestId("resume-anchor")).toBeDefined();
		expect(screen.getByText(/Você voltou/i)).toBeDefined();
	});

	it("FIX-49: conversa fresca (sem mensagens resumidas) NÃO mostra a âncora", () => {
		render(<MessageList messages={[msg("a", "oi"), msg("b", "resposta")]} isStreaming={false} />);
		expect(screen.queryByTestId("resume-anchor")).toBeNull();
	});

	it("FIX-49: hidratação NÃO mostra a pill 'Novas mensagens' sem o usuário ter rolado", () => {
		render(
			<MessageList
				messages={[resumedMsg("a", "oi"), resumedMsg("b", "resposta antiga")]}
				isStreaming={false}
			/>,
		);
		// scroll programático (a âncora rola sozinha) NÃO pode acender a pill —
		// pill = "você subiu, clique pra voltar", exige GESTO do usuário.
		fireEvent.scroll(container());
		expect(screen.queryByText("Novas mensagens")).toBeNull();
	});

	it("pill 'Novas mensagens' aparece após subir e religa o stick ao clicar", async () => {
		const { rerender } = render(
			<MessageList messages={[msg("a", "oi"), msg("b", "x")]} isStreaming={false} />,
		);
		await flushFrame();
		fireEvent.wheel(container(), { deltaY: -40 });
		const pill = screen.getByText("Novas mensagens");
		expect(pill).toBeDefined();

		scrollSpy.mockClear();
		fireEvent.click(pill);
		expect(scrollSpy).toHaveBeenCalled(); // religou → rolou pro fundo (chamada direta, síncrona)

		// e volta a acompanhar mensagens novas
		scrollSpy.mockClear();
		rerender(
			<MessageList
				messages={[msg("a", "oi"), msg("b", "x"), msg("c", "nova")]}
				isStreaming={false}
			/>,
		);
		await flushFrame();
		expect(scrollSpy).toHaveBeenCalled();
	});
});
