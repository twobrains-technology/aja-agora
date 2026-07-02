// Camada 1 (unit) — FIX-208: o toast do submit mostrava "HTTP 502" genérico
// quando o Cloudflare cortava com resposta html (não-JSON). Deve virar cópia
// amigável de indisponibilidade; e preservar a mensagem da app quando ela vem
// em JSON (body.message/body.error).
import { describe, expect, it } from "vitest";
import { deriveSubmitErrorMessage, GATEWAY_ERROR_COPY } from "./template-row-actions";

describe("FIX-208 — cópia amigável do erro de submit", () => {
	it("502 do gateway com body HTML → cópia amigável (não 'HTTP 502')", () => {
		const msg = deriveSubmitErrorMessage({
			status: 502,
			contentType: "text/html",
			jsonBody: null,
		});
		expect(msg).toBe(GATEWAY_ERROR_COPY);
		expect(msg).not.toMatch(/HTTP 502/);
	});

	it("5xx sem JSON → cópia amigável mesmo sem content-type", () => {
		const msg = deriveSubmitErrorMessage({ status: 503, contentType: null, jsonBody: null });
		expect(msg).toBe(GATEWAY_ERROR_COPY);
	});

	it("erro de negócio da app em JSON → preserva body.message", () => {
		const msg = deriveSubmitErrorMessage({
			status: 502,
			contentType: "application/json",
			jsonBody: { message: "Falha ao submeter à Meta", error: "createTemplate failed" },
		});
		expect(msg).toBe("Falha ao submeter à Meta");
	});

	it("JSON só com error → usa body.error", () => {
		const msg = deriveSubmitErrorMessage({
			status: 409,
			contentType: "application/json",
			jsonBody: { error: "Template já submetido" },
		});
		expect(msg).toBe("Template já submetido");
	});

	it("4xx sem corpo útil → fallback HTTP status (não a cópia de gateway)", () => {
		const msg = deriveSubmitErrorMessage({ status: 400, contentType: null, jsonBody: null });
		expect(msg).toBe("HTTP 400");
	});
});
