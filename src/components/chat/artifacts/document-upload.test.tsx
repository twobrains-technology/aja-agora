// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-10 (teste manual Kairo 2026-06-05): subir SÓ a frente da CNH
 * já postava "Enviei meu documento" e o bot respondia — sem dar tempo do
 * verso. "Aquele botão não pode responder exatamente quando enviou o
 * documento. Tem que dar a oportunidade de preencher a frente e o verso."
 *
 * Fix: cada slot sobe SILENCIOSO (endpoint dedicado /api/chat/document, sem
 * mensagem no chat); a conclusão é explícita — botão "Pronto, enviei tudo"
 * ou automática quando frente E verso completam.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentUploadPayload } from "@/lib/chat/types";

const sendAction = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({
		conversationId: "conv-123",
		sendAction,
		status: "ready",
	}),
}));

import { DocumentUpload } from "./document-upload";

const payload: DocumentUploadPayload = {
	proposalId: "prop-123",
	optional: true,
};

function pickFile(testId: string) {
	const input = screen.getByTestId(testId) as HTMLInputElement;
	const file = new File(["fake-image-bytes"], "cnh.jpg", { type: "image/jpeg" });
	fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
	sendAction.mockReset();
	document.body.innerHTML = "";
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({
			ok: true,
			json: async () => ({ ok: true }),
		})),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("FIX-10 — upload de slot é silencioso; conclusão é explícita", () => {
	it("subir SÓ a frente NÃO posta mensagem no chat (zero sendAction)", async () => {
		render(<DocumentUpload payload={payload} />);
		pickFile("doc-input-identidade_frente");
		await waitFor(() => {
			expect(document.body.textContent).toContain("enviado");
		});
		expect(sendAction).not.toHaveBeenCalled();
		// o upload aconteceu, só que silencioso (endpoint dedicado)
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("frente + verso completos → conclusão automática (UMA mensagem só)", async () => {
		render(<DocumentUpload payload={payload} />);
		pickFile("doc-input-identidade_frente");
		await waitFor(() => expect(document.body.textContent).toContain("frente — enviado"));
		pickFile("doc-input-identidade_verso");
		await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
		const [action] = sendAction.mock.calls[0];
		expect(action.kind).toBe("documents-done");
		expect(action.sentSlots).toEqual(["identidade_frente", "identidade_verso"]);
	});

	it("só a frente + clique em 'Pronto, enviei tudo' → conclusão com o que tem", async () => {
		render(<DocumentUpload payload={payload} />);
		pickFile("doc-input-identidade_frente");
		await waitFor(() => expect(document.body.textContent).toContain("frente — enviado"));
		fireEvent.click(screen.getByTestId("doc-done"));
		expect(sendAction).toHaveBeenCalledTimes(1);
		const [action] = sendAction.mock.calls[0];
		expect(action.kind).toBe("documents-done");
		expect(action.sentSlots).toEqual(["identidade_frente"]);
	});

	it("'Pronto, enviei tudo' NÃO aparece antes de qualquer upload", () => {
		render(<DocumentUpload payload={payload} />);
		expect(screen.queryByTestId("doc-done")).toBeNull();
	});

	it("'Pular por agora' continua funcionando (document-skip)", () => {
		render(<DocumentUpload payload={payload} />);
		fireEvent.click(screen.getByTestId("doc-skip"));
		expect(sendAction).toHaveBeenCalledTimes(1);
		expect(sendAction.mock.calls[0][0].kind).toBe("document-skip");
	});

	it("falha no upload mostra o link de fallback no card (sem quebrar o fluxo)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ ok: false, fallbackLink: "https://conexia.example/up/abc" }),
			})),
		);
		render(<DocumentUpload payload={payload} />);
		pickFile("doc-input-identidade_frente");
		await waitFor(() => {
			expect(document.body.textContent).toContain("conexia.example");
		});
		expect(sendAction).not.toHaveBeenCalled();
	});
});
