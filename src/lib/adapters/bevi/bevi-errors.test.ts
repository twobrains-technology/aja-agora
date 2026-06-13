import { describe, expect, it } from "vitest";
import {
	BeviApiError,
	BeviConfigError,
	MinCreditError,
	OngoingProposalError,
	toBeviError,
} from "./bevi-errors";

describe("toBeviError — envelope de erro → erro tipado (spec §10)", () => {
	it("403 → BeviConfigError (não vaza pro usuário)", () => {
		const e = toBeviError(403, "…não foi encontrado usuário para esta token.", null);
		expect(e).toBeInstanceOf(BeviConfigError);
		expect((e as BeviConfigError).code).toBe(403);
	});

	it("409 com ongoingProposalIds → OngoingProposalError preservando os IDs", () => {
		const e = toBeviError(409, "Já existe proposta em andamento.", {
			ongoingProposalIds: ["6a1f346110ffff8984ace724", "abc"],
		});
		expect(e).toBeInstanceOf(OngoingProposalError);
		expect((e as OngoingProposalError).ongoingProposalIds).toEqual([
			"6a1f346110ffff8984ace724",
			"abc",
		]);
	});

	it("400 valor abaixo do mínimo → MinCreditError extraindo o mínimo da mensagem", () => {
		const e = toBeviError(400, "Simulação inválida.", {
			errors: [{ field: "valor", message: "Valor abaixo do mínimo permitido (R$ 15.000,00)." }],
		});
		expect(e).toBeInstanceOf(MinCreditError);
		expect((e as MinCreditError).minCredit).toBe(15000);
	});

	it("400 campo obrigatório (não-valor) → BeviApiError genérico com errors[]", () => {
		const e = toBeviError(400, "Validação.", {
			errors: [{ field: "CPF", message: "CPF é obrigatório." }],
		});
		expect(e).toBeInstanceOf(BeviApiError);
		expect(e).not.toBeInstanceOf(MinCreditError);
		expect((e as BeviApiError).errors[0].field).toBe("CPF");
	});

	it("404 → BeviApiError genérico com o code preservado", () => {
		const e = toBeviError(404, "Proposta não encontrada.", {
			errors: [{ field: "proposalId", message: "Proposta não encontrada." }],
		});
		expect(e).toBeInstanceOf(BeviApiError);
		expect((e as BeviApiError).code).toBe(404);
	});
});
