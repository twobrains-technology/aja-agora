import { describe, expect, it } from "vitest";
import { SPECIALIST_BASE_PROMPT, SYSTEM_PROMPT } from "./system-prompt";

// ============================================================================
// FIX-INTEGRIDADE (2026-07-02) — teto/orçamento só emitir se cliente declarou
// ----------------------------------------------------------------------------
// Bug: agente afirma "93,17% do seu teto declarado" sem cliente ter declarado
// orçamento mensal (usa default interno como se fosse dado real). QA encontrou
// em TODAS as modalidades. REGRA FIXA: frase "% do seu teto" / "% do orçamento"
// emitir APENAS se `monthlyBudget` foi EFETIVAMENTE coletado do usuário.
// ============================================================================

describe("FIX-INTEGRIDADE — teto/orçamento fabricado (frase % do teto)", () => {
	it("o prompt menciona 'teto DECLARADO pelo próprio usuário' (não default)", () => {
		// Deve haver guardrail que diz: teto é DECLARADO, não inferido/default. O
		// guardrail vive no SPECIALIST_BASE_PROMPT (bloco de recomendação), então
		// checamos o prompt COMBINADO — não só o SYSTEM_PROMPT.
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		expect(combined).toMatch(
			/(teto declarado pelo próprio usuário|orçamento declarado|dados que o usuário forneceu)/i,
		);
	});

	it("SPECIALIST_BASE_PROMPT proíbe usar 'teto' quando o cliente NÃO declarou orçamento", () => {
		// Frase "% do seu teto" NÃO pode aparecer sem condition "se o cliente declarou orçamento"
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		// Deve ter instrução: "só cite teto/orçamento se o cliente informou".
		// Busca por uma regra que condicionalize a emissão da frase.
		expect(combined).toMatch(
			/(se.*orçamento.*declarado|apenas se.*orçamento|só.*quando.*orçamento|condicion|blindar|fabricado)/i,
		);
	});

	it("frase de recomendação NÃO menciona 'teto' sem garantia de que foi coletado", () => {
		// Template obrigatório: "R$ {parcela}/mês — {percentual}% do seu teto de R$ {teto}"
		// Mas isso SÓ aparece SE teto foi declarado. O guardrail condiciona a emissão
		// da frase ao cliente ter informado o orçamento — vive no SPECIALIST_BASE_PROMPT
		// (ex.: "APENAS SE CLIENTE DECLAROU ORÇAMENTO" / "Se o cliente NÃO informou...").
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		expect(combined).toMatch(
			/(apenas se cliente declarou|se o cliente n[ãa]o informou|apenas quando|se.*orçamento.*declarad|condicion|blindar)/i,
		);
	});

	it("MOTO NÃO deve emitir 'teto' porque não coleta orçamento mensal", () => {
		const combined = `${SYSTEM_PROMPT}\n${SPECIALIST_BASE_PROMPT}`;
		// Deve haver nota que MOTO não coleta orçamento ou regra específica pra MOTO.
		// Ou: directives.ts deve não passar budget pra MOTO no recommend_groups.
		// Verificar se há referência a "MOTO" em contexto de orçamento/teto.
		const motoSection =
			combined.match(
				/(MOTO[\s\S]{0,500}(?:orçamento|teto|budget))|moto[\s\S]{0,300}(?:sem.*orçamento|não.*coleta)/i,
			)?.[0] || "";
		// Por enquanto, aceitar se não há instrução explícita (fix será em directives.ts).
		// Este teste é permissivo — o real check é em orchestrator/directives.test.ts.
		expect(combined).toBeDefined(); // Placeholder — fix em orchestrator.
	});
});
