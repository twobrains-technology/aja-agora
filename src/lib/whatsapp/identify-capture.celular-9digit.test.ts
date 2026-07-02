import { describe, expect, it } from "vitest";
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
