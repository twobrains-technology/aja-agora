import { afterEach, describe, expect, it, vi } from "vitest";
import { waIdToCelular } from "./identify-capture";

/**
 * Bug de prod 2026-07-02 (conv cb71897a): fechamento (Trilho A) da Bevi rejeitava
 * com `BeviApiError: Dados inválidos — { field: 'CELULAR', message: 'CELULAR
 * inválido.' }`. O usuário via "Tive um problema ao falar com a administradora
 * agora." e nunca fechava a proposta.
 *
 * Causa: no WhatsApp o celular NÃO é digitado — vem do waId (`waIdToCelular`). O
 * waId brasileiro de MÓVEL DERRUBA o 9º dígito (o "nono dígito"): o número real
 * `55 62 99249-6793` chega como waId `55 62 9249-6793` (12 dígitos). `waIdToCelular`
 * só tirava o `55` → `6292496793` (10 dígitos). A Bevi exige 11 (DDD + 9 + 8) e
 * rejeita 10. A descoberta (Trilho B) é leniente e passava; o fechamento valida e
 * barra. Fix: reinserir o 9 após o DDD quando o resultado tem 10 dígitos (todo waId
 * de WhatsApp é móvel — não existe WhatsApp em telefone fixo).
 */
describe("waIdToCelular — 9º dígito do móvel BR (bug fechamento CELULAR inválido)", () => {
	it("waId de móvel SEM o 9 (WhatsApp derrubou) → reinsere o 9 → 11 dígitos", () => {
		// O caso do Kairo em prod: 55 + 62 + 92496793 (8 díg) → 62 + 9 + 92496793.
		expect(waIdToCelular("556292496793")).toBe("62992496793");
		expect(waIdToCelular("556292496793")).toHaveLength(11);
	});

	it("waId de São Paulo SEM o 9 → reinsere o 9 → 11 dígitos", () => {
		expect(waIdToCelular("551199998888")).toBe("11999998888");
	});

	it("waId JÁ com o 9 (13 díg com DDI) → só tira o 55, mantém 11 dígitos", () => {
		expect(waIdToCelular("5562992496793")).toBe("62992496793");
		expect(waIdToCelular("5562992496793")).toHaveLength(11);
	});

	it("celular já sem DDI e com 9 (11 díg) → inalterado", () => {
		expect(waIdToCelular("62992496793")).toBe("62992496793");
	});

	it("mascara/formatação não-dígito é ignorada", () => {
		expect(waIdToCelular("+55 (62) 9249-6793")).toBe("62992496793");
	});
});

/**
 * Bug de QA local (2026-07-03, rodada qa-dono-produto): fechamento no SIMULADOR
 * (/admin/simulator/whatsapp) rejeitava com o MESMO erro `CELULAR inválido` — mas
 * a causa é OUTRA. O waId do simulador é sintético (`SIM-<uuid>`, gerado em
 * src/app/api/admin/simulator/sessions/route.ts, roteado via isSimulatedWaId em
 * simulator-bus.ts). `waIdToCelular` fazia `replace(/\D/g,"")` no UUID inteiro,
 * extraindo 24+ dígitos arbitrários — a Bevi rejeitava.
 *
 * Fix (feedback do Kairo): a Bevi VALIDA o celular contra o CPF, então um número
 * sintético não fecha — precisa ser REAL. waId simulado usa SIMULATOR_TEST_CELULAR
 * (número de teste real, PII no env/vault, nunca hardcoded), pareado com o CPF da
 * mesma conta. Sem o env, cai num sintético de formato válido (não fecha, mas não
 * crasha o formato).
 */
describe("waIdToCelular — waId sintético do simulador (SIM-<uuid>)", () => {
	afterEach(() => vi.unstubAllEnvs());

	it("com SIMULATOR_TEST_CELULAR setado → usa o número REAL normalizado (11 díg)", () => {
		vi.stubEnv("SIMULATOR_TEST_CELULAR", "5562992496793"); // real, 13 díg com DDI
		expect(waIdToCelular("SIM-b402c940-e80c-42a6-8677-711d3764b55f")).toBe("62992496793");
	});

	it("SEM o env → fallback sintético de formato VÁLIDO (11 díg, DDD 62, 9º dígito)", () => {
		vi.stubEnv("SIMULATOR_TEST_CELULAR", "");
		const celular = waIdToCelular("SIM-b402c940-e80c-42a6-8677-711d3764b55f");
		expect(celular).toHaveLength(11);
		expect(celular.startsWith("629")).toBe(true);
	});

	it("fallback sintético é determinístico e sem colisão óbvia", () => {
		vi.stubEnv("SIMULATOR_TEST_CELULAR", "");
		const a1 = waIdToCelular("SIM-11111111-1111-1111-1111-111111111111");
		const a2 = waIdToCelular("SIM-11111111-1111-1111-1111-111111111111");
		const b = waIdToCelular("SIM-22222222-2222-2222-2222-222222222222");
		expect(a1).toBe(a2);
		expect(a1).not.toBe(b);
	});
});
