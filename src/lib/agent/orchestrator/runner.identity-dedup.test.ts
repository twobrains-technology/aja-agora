import { describe, expect, it } from "vitest";
import { modelAlreadyAskedIdentity } from "./runner";

// ============================================================================
// Anti-duplicação do pedido de identidade (2026-07-15, achado ao vivo — Kairo)
// ----------------------------------------------------------------------------
// No turno do valor, o modelo às vezes ANTECIPA "preciso do seu CPF e celular"
// apesar do system-prompt proibir (Haiku desobedece). Como o pedido é
// AFIRMATIVO, o `hasHeldQuestion()` do sanitizer (só pega "?") não detectava, e
// a pergunta canônica determinística saía POR CIMA → pedido DUPLICADO no mesmo
// balão. Se o modelo já pediu identidade, a canônica se cala (a fala do modelo
// vence). Requer CPF + um canal de contato pra ter certeza que é o pedido.
// ============================================================================

describe("modelAlreadyAskedIdentity — detecta o modelo antecipando o pedido de identidade", () => {
	it("detecta quando o texto pede CPF + celular/whatsapp/telefone", () => {
		expect(
			modelAlreadyAskedIdentity(
				"Agora preciso do seu CPF e celular pra trazer as ofertas reais das administradoras",
			),
		).toBe(true);
		expect(modelAlreadyAskedIdentity("me manda seu CPF e o WhatsApp")).toBe(true);
		expect(modelAlreadyAskedIdentity("preciso do CPF e do telefone")).toBe(true);
	});

	it("NÃO detecta quando falta CPF ou falta o canal de contato", () => {
		// só confirma o valor — não é pedido de identidade
		expect(modelAlreadyAskedIdentity("Boa, 80 mil então.")).toBe(false);
		// menciona celular mas não CPF
		expect(modelAlreadyAskedIdentity("qual o seu celular?")).toBe(false);
		// menciona CPF mas não o canal de contato
		expect(modelAlreadyAskedIdentity("qual o seu CPF?")).toBe(false);
	});
});
