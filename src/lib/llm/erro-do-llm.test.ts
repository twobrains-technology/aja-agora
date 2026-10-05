// A classificação da falha do LLM é o que decide se alguém é acordado.
//
// O caso medido serve de fixture: produção em 01/10/2026 levou 29× HTTP 400
// "Your credit balance is too low to access the Anthropic API" e ninguém foi
// avisado. Se a classificação não reconhece billing, o alerta não sai.
import { describe, expect, it } from "vitest";
import { classificarErroDoLlm } from "./erro-do-llm";

describe("classificarErroDoLlm", () => {
	describe("billing", () => {
		it("reconhece a frase medida da Anthropic", () => {
			expect(
				classificarErroDoLlm(
					new Error("400 Your credit balance is too low to access the Anthropic API"),
				),
			).toBe("billing");
		});

		it("reconhece o equivalente OpenAI (quota)", () => {
			expect(classificarErroDoLlm(new Error("insufficient_quota"))).toBe("billing");
			expect(classificarErroDoLlm(new Error("You exceeded your current quota"))).toBe("billing");
		});

		it("lê o corpo da resposta quando o SDK embrulha o erro", () => {
			const err = Object.assign(new Error("APIError"), {
				statusCode: 400,
				responseBody: '{"error":{"message":"credit balance is too low"}}',
			});
			expect(classificarErroDoLlm(err)).toBe("billing");
		});
	});

	describe("rate_limit", () => {
		it("reconhece pelo status 429", () => {
			const err = Object.assign(new Error("request failed"), { statusCode: 429 });
			expect(classificarErroDoLlm(err)).toBe("rate_limit");
		});

		it("reconhece pelo texto", () => {
			expect(classificarErroDoLlm(new Error("Too Many Requests"))).toBe("rate_limit");
			expect(classificarErroDoLlm(new Error("rate limit exceeded"))).toBe("rate_limit");
		});
	});

	describe("indisponivel", () => {
		it("reconhece 5xx pelo status", () => {
			expect(classificarErroDoLlm(Object.assign(new Error("x"), { statusCode: 503 }))).toBe(
				"indisponivel",
			);
			expect(classificarErroDoLlm(Object.assign(new Error("x"), { statusCode: 529 }))).toBe(
				"indisponivel",
			);
		});

		it("reconhece sobrecarga e queda de rede pelo texto", () => {
			expect(classificarErroDoLlm(new Error("Overloaded"))).toBe("indisponivel");
			expect(classificarErroDoLlm(new Error("fetch failed"))).toBe("indisponivel");
			expect(classificarErroDoLlm(new Error("socket hang up"))).toBe("indisponivel");
		});
	});

	describe("outro", () => {
		it("erro sem sinal conhecido é outro", () => {
			expect(classificarErroDoLlm(new Error("boom da administradora"))).toBe("outro");
			expect(classificarErroDoLlm(null)).toBe("outro");
			expect(classificarErroDoLlm(undefined)).toBe("outro");
		});

		it("não confunde um 400 genérico com billing", () => {
			const err = Object.assign(new Error("invalid request format"), { statusCode: 400 });
			expect(classificarErroDoLlm(err)).toBe("outro");
		});
	});
});