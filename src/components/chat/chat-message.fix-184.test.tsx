// @vitest-environment happy-dom
/**
 * FIX-184 — "Prazer, Mirella!" (a saudação) aparecia DUPLICADA na tela, mas o
 * backend salvou 1x (provado no DB de produção: 1 único registro em `messages`).
 *
 * Root cause (cravada por leitura de código, não hipótese):
 * - `runner.ts` acumula os `text-delta` da LLM em `fullResponse` e SÓ colapsa o
 *   eco/degeneração ("Prazer, Mirella!Prazer, Mirella!") com `collapseEchoedSegments`
 *   DEPOIS do streaming (runner.ts:308) — ANTES de persistir. Logo o DB fica limpo.
 * - Mas o stream AO VIVO já emitiu os deltas crus pro cliente (runner.ts:184 →
 *   adapter `pipeOrchestratorToWriter`). O cliente renderiza o que recebeu: o eco.
 * → A duplicação é EXCLUSIVAMENTE de render (a tela não bate com o DB).
 *
 * O fix é client-side (o card proíbe tocar runner/tools/prompt — além de o runner
 * ser território do bloco-a/FIX-182 nesta mesma onda): o render colapsa o eco do
 * mesmo jeito que a persistência, pra a tela bater com o DB.
 *
 * Este teste renderiza o `ChatMessage` REAL com os 2 shapes fiéis do eco e falha
 * ANTES do fix (a saudação aparece 2x no texto renderizado).
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AjaUIMessage } from "@/lib/chat/ui-message";
import { ChatMessage } from "./chat-message";

// Artifacts/gates puxam o provider (useChat). Nenhuma part do teste os renderiza,
// mas mockamos por robustez (mesmo padrão do teste FIX-130).
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ conversationId: "conv-1", sendAction: vi.fn(), status: "ready" }),
}));

beforeEach(() => {
	document.body.innerHTML = "";
	// happy-dom: use-reduced-motion / motion consultam matchMedia. Stub determinístico.
	if (!window.matchMedia) {
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})) as unknown as typeof window.matchMedia;
	}
});

afterEach(() => {
	cleanup();
});

function countOccurrences(haystack: string, needle: string): number {
	let count = 0;
	let idx = haystack.indexOf(needle);
	while (idx !== -1) {
		count++;
		idx = haystack.indexOf(needle, idx + needle.length);
	}
	return count;
}

describe("FIX-184 — saudação duplicada no render (eco da LLM não colapsado no cliente)", () => {
	it("colapsa eco CONCATENADO num único text part (shape do forceToolChoice: tool → texto)", () => {
		// forceToolChoice (BUG-SHORT-GREETING-AFTER-NAME) faz a tool `save_contact_name`
		// vir PRIMEIRO; o texto então stremia contíguo num só part — com o eco cru.
		const message: AjaUIMessage = {
			id: "msg-echo-concat",
			role: "assistant",
			parts: [
				{ type: "data-tool", id: "t0", data: { tool: "save_contact_name" } },
				{ type: "text", text: "Prazer, Mirella!Prazer, Mirella!" },
			],
		} as AjaUIMessage;

		const { container } = render(<ChatMessage message={message} isLast />);
		const text = container.textContent ?? "";
		expect(countOccurrences(text, "Prazer, Mirella!")).toBe(1);
	});

	it("colapsa eco em text parts ADJACENTES (separados por data-tool, que é dropado)", () => {
		// Se um text-delta abre um part, uma tool-call fecha (data-tool) e o eco abre
		// outro part, viram 2 text parts adjacentes (o data-tool é dropado em
		// classifyParts) → groupAdjacentText junta com "\n\n" → 2x na tela.
		const message: AjaUIMessage = {
			id: "msg-echo-split",
			role: "assistant",
			parts: [
				{ type: "text", text: "Prazer, Mirella!" },
				{ type: "data-tool", id: "t1", data: { tool: "save_contact_name" } },
				{ type: "text", text: "Prazer, Mirella!" },
			],
		} as AjaUIMessage;

		const { container } = render(<ChatMessage message={message} isLast />);
		const text = container.textContent ?? "";
		expect(countOccurrences(text, "Prazer, Mirella!")).toBe(1);
	});

	it("NÃO colapsa texto legítimo que só se PARECE (frases distintas ficam intactas)", () => {
		// Guarda de paridade com o server: só eco 100% idêntico consecutivo é colapsado.
		const message: AjaUIMessage = {
			id: "msg-legit",
			role: "assistant",
			parts: [{ type: "text", text: "Prazer, Mirella! Vamos achar seu carro?" }],
		} as AjaUIMessage;

		const { container } = render(<ChatMessage message={message} isLast />);
		const text = container.textContent ?? "";
		expect(countOccurrences(text, "Prazer, Mirella!")).toBe(1);
		expect(text).toContain("Vamos achar seu carro?");
	});
});
