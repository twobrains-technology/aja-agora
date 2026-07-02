import { describe, expect, it } from "vitest";
import {
	BeviApiError,
	BeviConfigError,
	DuplicatedProposalError,
	isTransientDiscoveryError,
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

// FIX-186 (Kairo 2026-07-01) — erro de descoberta vira diretiva determinística
// (retry + fallback humano). O retry silencioso só faz sentido em erro
// TRANSITÓRIO (rede/timeout/5xx): tentar de novo pode curar. Erro DURO
// (config/4xx) nunca cura no retry — vai direto ao fallback humano. A
// classificação é CÓDIGO, não regra-no-prompt (Lei 4).
describe("isTransientDiscoveryError — transitório (retry pode curar) × duro", () => {
	it("BeviConfigError (403) é DURO — credencial/config nunca cura no retry", () => {
		expect(isTransientDiscoveryError(new BeviConfigError("sem token", 403))).toBe(false);
	});

	it("BeviApiError 4xx (400/404/409/410) é DURO", () => {
		expect(isTransientDiscoveryError(new BeviApiError(400, "bad"))).toBe(false);
		expect(isTransientDiscoveryError(new BeviApiError(404, "not found"))).toBe(false);
		expect(isTransientDiscoveryError(new BeviApiError(409, "conflict"))).toBe(false);
		expect(isTransientDiscoveryError(new BeviApiError(410, "gone"))).toBe(false);
	});

	it("BeviApiError 5xx é TRANSITÓRIO — servidor da Bevi soluçou, retry pode curar", () => {
		expect(isTransientDiscoveryError(new BeviApiError(500, "boom"))).toBe(true);
		expect(isTransientDiscoveryError(new BeviApiError(502, "bad gateway"))).toBe(true);
		expect(isTransientDiscoveryError(new BeviApiError(503, "unavailable"))).toBe(true);
	});

	it("BeviApiError 408/429 (timeout/rate-limit) é TRANSITÓRIO", () => {
		expect(isTransientDiscoveryError(new BeviApiError(408, "timeout"))).toBe(true);
		expect(isTransientDiscoveryError(new BeviApiError(429, "slow down"))).toBe(true);
	});

	it("MinCreditError e DuplicatedProposalError (400 de domínio) são DUROS", () => {
		expect(isTransientDiscoveryError(new MinCreditError("min", 15000))).toBe(false);
		expect(isTransientDiscoveryError(new DuplicatedProposalError("dup"))).toBe(false);
	});

	it("erro de rede/fetch (TypeError) é TRANSITÓRIO", () => {
		expect(isTransientDiscoveryError(new TypeError("fetch failed"))).toBe(true);
		expect(isTransientDiscoveryError(new Error("ECONNREFUSED 1.2.3.4:443"))).toBe(true);
	});

	it("AbortError (timeout do fetch) é TRANSITÓRIO", () => {
		const abort = new Error("The operation was aborted");
		abort.name = "AbortError";
		expect(isTransientDiscoveryError(abort)).toBe(true);
	});

	it("erro genérico/desconhecido é TRANSITÓRIO por default (1 retry barato não machuca)", () => {
		expect(isTransientDiscoveryError(new Error("boom"))).toBe(true);
		expect(isTransientDiscoveryError("string solta")).toBe(true);
		expect(isTransientDiscoveryError(null)).toBe(true);
	});
});
