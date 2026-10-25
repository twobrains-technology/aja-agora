// @vitest-environment happy-dom
/**
 * Diagnóstico de conversa SEM persona (vendedor livre): o diagnóstico RODA e sugere correções,
 * mas não há persona onde aplicar. Antes, o painel oferecia "Aplicar" e o clique postava em
 * `/api/admin/personas/null/...` → 404 na cara do operador.
 *
 * A correção: sem persona, o "Aplicar" some e a sugestão aparece como texto pronto pra colar na
 * conduta do agente (`/admin/caixa`), que é onde o vendedor livre é corrigido.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiagnosisPanel } from "./diagnosis-panel";

const DIAGNOSTICO = {
	rootCause: "O agente prometeu contemplação garantida.",
	suggestedExamples: [
		{
			userMessage: "vou ser contemplado esse mês?",
			assistantResponse: "Não existe garantia de contemplação — é sorteio.",
			rationale: "Elimina a promessa de contemplação.",
		},
	],
	suggestedForbiddenTopics: [
		{
			topic: "garantia de contemplação",
			responseWhenAsked: "Explique que a contemplação é por sorteio ou lance.",
			rationale: "Risco jurídico.",
		},
	],
	suggestedHandoffTriggers: [
		{ condition: "o cliente pede o contrato assinado", rationale: "A mesa fecha o contrato." },
	],
};

const fetchMock = vi.fn();

function respostaDoDiagnostico(personaId: string | null) {
	return {
		ok: true,
		json: async () => ({
			diagnosis: DIAGNOSTICO,
			meta: { personaId, evaluationId: "eval-1" },
		}),
	} as unknown as Response;
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function diagnosticar() {
	render(<DiagnosisPanel conversationId="conv-1" canDiagnose />);
	fireEvent.click(screen.getByRole("button", { name: "Diagnosticar" }));
	await screen.findByText(DIAGNOSTICO.rootCause);
}

describe("DiagnosisPanel — conversa sem persona (vendedor livre)", () => {
	it("esconde o Aplicar e entrega a sugestão como texto pra colar em /admin/caixa", async () => {
		fetchMock.mockResolvedValueOnce(respostaDoDiagnostico(null));

		await diagnosticar();

		expect(screen.queryByRole("button", { name: "Aplicar" })).toBeNull();

		const textos = screen.getAllByLabelText("Sugestão para copiar") as HTMLTextAreaElement[];
		expect(textos).toHaveLength(3);
		expect(textos[0].value).toContain("vou ser contemplado esse mês?");
		expect(textos[0].value).toContain("Não existe garantia de contemplação");
		expect(textos[1].value).toContain("garantia de contemplação");
		expect(textos[2].value).toContain("o cliente pede o contrato assinado");

		const links = screen.getAllByRole("link");
		expect(links.some((a) => a.getAttribute("href") === "/admin/caixa")).toBe(true);

		// Nenhuma escrita em persona: a única chamada é o próprio diagnóstico.
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(String(fetchMock.mock.calls[0][0])).toContain("/diagnose");
	});

	it("com persona continua aplicando direto na persona", async () => {
		fetchMock
			.mockResolvedValueOnce(respostaDoDiagnostico("persona-1"))
			.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as unknown as Response);

		await diagnosticar();

		const aplicar = screen.getAllByRole("button", { name: "Aplicar" });
		expect(aplicar).toHaveLength(3);
		expect(screen.queryByLabelText("Sugestão para copiar")).toBeNull();

		fireEvent.click(aplicar[0]);
		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/admin/personas/persona-1/examples",
				expect.objectContaining({ method: "POST" }),
			);
		});
	});
});
