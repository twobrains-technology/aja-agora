// @vitest-environment happy-dom
// FIX-373 — achado ao vivo na campanha vendedor-matador (persona "carro,
// meio a meio", gate lance-embutido): o backend levou ~48-86s reais (busca
// dupla sem/com embutido + ranking) pra devolver a recomendação — acima do
// teto de 45s do watchdog FIX-110 — e o cliente mostrou "Tentar novamente"
// mesmo com o backend respondendo 200 no fim (confirmado nos logs do
// container). O servidor já manda um "batimento" a cada 8s durante esperas
// longas (`src/lib/web/adapter.ts`, `data-tool: keepalive`, `transient: true`)
// especificamente pra provar que a conexão está viva — mas o `useChat` do
// provider nunca passava `onData`, então esse batimento nunca resetava
// `lastActivityRef` do watchdog (que só ouve `[chat.messages, chat.status]`,
// e parts transientes NÃO tocam `chat.messages` por design do AI SDK). Duas
// redes de segurança construídas em momentos diferentes, cada uma correta
// isoladamente, nunca conversaram entre si.
import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockStatus = "submitted" | "streaming" | "ready" | "error";

let capturedOnData: ((part: unknown) => void) | undefined;
let mockStatus: MockStatus = "submitted";

vi.mock("@ai-sdk/react", () => ({
	useChat: (opts: { onData?: (part: unknown) => void }) => {
		capturedOnData = opts.onData;
		return {
			messages: [],
			status: mockStatus,
			error: undefined,
			sendMessage: vi.fn(),
			regenerate: vi.fn(),
			setMessages: vi.fn(),
			stop: vi.fn(),
			clearError: vi.fn(),
		};
	},
}));

vi.mock("ai", () => ({
	DefaultChatTransport: class {},
}));

vi.mock("@/lib/utils/id", () => ({ generateId: () => "conv-fix-373" }));

const { ChatProvider, useChatContext } = await import("./provider");

function ErrorProbe() {
	const { error } = useChatContext();
	return <div data-testid="probe-error">{error ? error.message : "sem-erro"}</div>;
}

describe("FIX-373 — batimento (keepalive transiente) precisa resetar o watchdog do stream", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockStatus = "streaming";
		capturedOnData = undefined;
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("sem nenhum sinal de atividade, o watchdog mata o stream ao estourar o teto (baseline)", () => {
		render(
			<ChatProvider>
				<ErrorProbe />
			</ChatProvider>,
		);

		act(() => {
			vi.advanceTimersByTime(46_000);
		});

		expect(screen.getByTestId("probe-error").textContent).not.toBe("sem-erro");
	});

	it("batimento a cada 8s via onData mantém o stream vivo além do teto de 45s", () => {
		render(
			<ChatProvider>
				<ErrorProbe />
			</ChatProvider>,
		);

		expect(capturedOnData).toBeTypeOf("function");

		// Simula o `batimento` real do adapter (data-tool keepalive a cada 8s,
		// ver src/lib/web/adapter.ts) por 80s corridos — bem além do teto de 45s.
		for (let i = 0; i < 10; i++) {
			act(() => {
				vi.advanceTimersByTime(8_000);
				capturedOnData?.({ type: "data-tool", data: { tool: "keepalive" }, transient: true });
			});
		}

		expect(screen.getByTestId("probe-error").textContent).toBe("sem-erro");
	});
});
