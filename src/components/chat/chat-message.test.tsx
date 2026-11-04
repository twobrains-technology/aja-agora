// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		sendUserMessage: vi.fn(),
		sendAction: vi.fn(),
		status: "streaming" as const,
		messages: [],
	}),
}));

import { ChatMessage } from "./chat-message";

afterEach(cleanup);

const GROUPS = [
	{
		id: "g1",
		administradora: "ITAU",
		category: "auto" as const,
		creditValue: 60_000,
		monthlyPayment: 1_200,
		adminFeePercent: 18,
		termMonths: 80,
		availableSlots: 3,
	},
];

function assistant(parts: unknown[], id = "m1"): AjaUIMessage {
	return { id, role: "assistant", parts } as unknown as AjaUIMessage;
}

const cardPart = {
	type: "data-artifact",
	data: { type: "comparison_table", payload: { groups: GROUPS } },
};

describe("ChatMessage — ordem do stream (R5.1)", () => {
	it("mostra o card no MEIO do turno, sem esperar o fim do stream", () => {
		const message = assistant([
			{ type: "text", text: "Deixa eu ver quais grupos cabem no seu valor." },
			cardPart,
			{ type: "text", text: "Essas três são as que mais combinam com você." },
		]);

		render(<ChatMessage message={message} isStreaming isLast isNew={false} />);

		// Enquanto o turno streama, o card JÁ está na tela. Antes ele ficava
		// escondido até o turno terminar (gate `allTextsBeforeReady`) e só então
		// surgia — o "card pula para o fim" que o cliente viu.
		expect(screen.getByTestId("carrossel-cartas")).toBeTruthy();
	});

	it("mantém a ordem texto → card → texto na ordem em que o stream chegou", () => {
		const message = assistant([
			{ type: "text", text: "Deixa eu ver quais grupos cabem no seu valor." },
			cardPart,
			{ type: "text", text: "Essas três são as que mais combinam com você." },
		]);

		const { container } = render(
			<ChatMessage message={message} isStreaming isLast isNew={false} />,
		);

		const baloes = screen.getAllByTestId("balao-texto");
		const card = screen.getByTestId("carrossel-cartas");
		expect(baloes).toHaveLength(2);
		expect(baloes[0].textContent).toContain("cabem no seu valor");
		expect(baloes[1].textContent).toContain("mais combinam com você");

		// Ordem no DOM: balão 1 antes do card, card antes do balão 2.
		const ordem = (a: Element, b: Element) =>
			Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
		expect(ordem(baloes[0], card)).toBe(true);
		expect(ordem(card, baloes[1])).toBe(true);
		expect(container.textContent).toContain("Essas três são as que mais combinam");
	});

	it("não junta num balão só o texto que veio antes e o que veio depois da ferramenta", () => {
		const message = assistant([
			{ type: "text", text: "Deixa eu buscar as cartas disponíveis." },
			{ type: "data-tool", data: { tool: "buscar_cartas" } },
			{ type: "text", text: "Achei três opções com parcela parecida." },
		]);

		render(<ChatMessage message={message} isStreaming isLast isNew={false} />);

		const baloes = screen.getAllByTestId("balao-texto");
		expect(baloes).toHaveLength(2);
		expect(baloes[0].textContent).toContain("buscar as cartas");
		expect(baloes[1].textContent).toContain("Achei três opções");
	});
});

// MEDIDO no chat web (`.orientacao/prints-ux/10-conversa-picada-oferta.png`, conversa no banco
// com 3 mensagens `assistant` seguidas): o servidor grava a conversa picada em TRÊS balões — cada
// `text-boundary` fecha um `text-start/text-end` —, mas a tela mostrava um balão só com as três
// linhas. A fronteira do servidor chega ao cliente como PART DE TEXTO NOVA: part de texto adjacente
// não é continuação da anterior, é outro balão.
describe("conversa picada — cada fala do turno é um balão (print 10)", () => {
	const FALAS = [
		"Olha, eu escolheria a CANOPUS de 90 mil.",
		"Ela tem a parcela mais leve entre as de 90 mil e sorteia 3 cartas por mês, mais que as outras do grupo.",
		"Quer seguir com ela ou prefere comparar outra?",
	];

	// O turno como ele foi PERSISTIDO: o card da oferta e, depois dele, uma part de texto por
	// balão (uma linha por `text-boundary`, ver `persist-livre.ts`).
	const turnoDoPrint10 = () =>
		assistant([cardPart, ...FALAS.map((text) => ({ type: "text", text }))]);

	it("três parts de texto separadas pela fronteira viram três balões", () => {
		render(<ChatMessage message={turnoDoPrint10()} isStreaming isLast isNew={false} />);

		const baloes = screen.getAllByTestId("balao-texto");
		expect(baloes).toHaveLength(3);
		for (const [i, fala] of FALAS.entries()) {
			expect(baloes[i].textContent).toContain(fala);
		}
		// O card continua ACIMA das falas: a oferta é o que a primeira linha comenta.
		const card = screen.getByTestId("carrossel-cartas");
		const ordem = (a: Element, b: Element) =>
			Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
		expect(ordem(card, baloes[0])).toBe(true);
	});

	it("na retomada a conversa picada aparece igual: um balão por fala", () => {
		// `resume.ts` devolve UM turno com uma part de texto por linha gravada — a mesma forma
		// acima, então a tela tem de ser a mesma.
		render(<ChatMessage message={turnoDoPrint10()} isNew={false} />);
		expect(screen.getAllByTestId("balao-texto")).toHaveLength(3);
	});
});
