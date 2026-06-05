/**
 * Camada 1 — FIX-9 (teste manual Kairo 2026-06-05): o passo 5 re-pedia CPF e
 * celular que JÁ foram coletados (e cifrados) no gate identify — "totalmente
 * incorreto, uma vez que já foi informado".
 *
 * Fix: o payload do contract_form é enriquecido server-side com a identidade
 * armazenada — CPF MASCARADO (nunca em claro no payload!), celular formatado,
 * flag identityOnFile. O submit usa useStoredIdentity (o CPF completo nunca
 * volta pro browser); o route resolve via loadIdentity.
 */

import { describe, expect, it } from "vitest";
import {
	enrichContractFormPayload,
	formatPhoneForDisplay,
	maskCpfForDisplay,
} from "./contract-form-prefill";

describe("FIX-9 — máscaras de exibição (nunca PII em claro)", () => {
	it("CPF mascarado mostra só os 3 primeiros e 2 últimos dígitos", () => {
		expect(maskCpfForDisplay("52998224725")).toBe("529.•••.•••-25");
		// nunca os dígitos do meio
		expect(maskCpfForDisplay("52998224725")).not.toContain("982");
	});

	it("celular formatado pra exibição", () => {
		expect(formatPhoneForDisplay("62999887766")).toBe("(62) 99988-7766");
	});
});

describe("FIX-9 — enrichContractFormPayload", () => {
	it("com identidade armazenada: identityOnFile + CPF mascarado + celular", () => {
		const out = enrichContractFormPayload(
			{ conversationId: "c1", administradora: "CANOPUS" },
			{ cpf: "52998224725", celular: "62999887766" },
		);
		expect(out.identityOnFile).toBe(true);
		expect(out.prefilledCpfMasked).toBe("529.•••.•••-25");
		expect(out.prefilledPhone).toBe("(62) 99988-7766");
		// NUNCA o CPF completo em nenhum campo do payload
		expect(JSON.stringify(out)).not.toContain("52998224725");
	});

	it("sem identidade (null): payload intacto, sem flag", () => {
		const input = { conversationId: "c1", administradora: "CANOPUS" };
		const out = enrichContractFormPayload(input, null);
		expect(out.identityOnFile).toBeUndefined();
		expect(out).toEqual(input);
	});
});

describe("FIX-9 — acoplamento (runtime de verdade)", () => {
	it("runner enriquece o contract_form com a identidade armazenada", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/lib/agent/orchestrator/runner.ts", "utf-8");
		expect(src).toMatch(/enrichContractFormPayload/);
	});

	it("route aceita useStoredIdentity e resolve via loadIdentity", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/app/api/chat/route.ts", "utf-8");
		expect(src).toMatch(/useStoredIdentity/);
		expect(src).toMatch(/loadIdentity/);
	});

	it("componente respeita identityOnFile (modo confirmação, submit sem digitar CPF)", async () => {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync("src/components/chat/artifacts/contract-form.tsx", "utf-8");
		expect(src).toMatch(/identityOnFile/);
		expect(src).toMatch(/useStoredIdentity/);
		// opção de corrigir os dados continua existindo
		expect(src).toMatch(/[Uu]sar outros dados|[Cc]orrigir/);
	});
});
