/**
 * FIX-394 — a variante do teste do telefone é da VISITA, não da pessoa.
 *
 * Decisão da call de 29/09/2026 (Gustavo, 12:10:35): *"A cada visita diferente,
 * gera. (…) eu entrei, eu vou cair na A. O Caio entrou, cai na B."* — e o Kairo
 * (12:15) cravou a condição: com pouca massa, a atribuição tem que ser
 * confiável, senão o resultado é viés.
 *
 * O que este teste trava:
 *  1. determinismo — a MESMA visita cai SEMPRE na mesma variante (recarga não
 *     troca o caminho);
 *  2. distribuição — visitas diferentes caem em ambos os lados, dentro de folga
 *     (sem `Math.random()`, que faria a mesma visita oscilar);
 *  3. exatamente DUAS variantes (B e C) — a constante é a fonte única;
 *  4. variante desconhecida ⇒ erro ALTO, nunca um caminho mudo.
 *
 * Nenhum teste aqui toca banco nem rede.
 */

import { describe, expect, it } from "vitest";
import {
	ehVarianteDoTelefone,
	hashDaSemente,
	lerVariante,
	VARIANTES_DO_TELEFONE,
	type VarianteDoTelefone,
	varianteDaConversa,
	varianteDaVisita,
} from "./variante-da-visita";

/** Uuid estável, pro hash não depender de gerador aleatório do teste. */
function uuidDe(n: number): string {
	const hex = n.toString(16).padStart(12, "0");
	return `00000000-0000-4000-8000-${hex}`;
}

describe("VARIANTES_DO_TELEFONE (fonte única)", () => {
	it("são exatamente DUAS — B (telefone antes) e C (blur)", () => {
		expect(VARIANTES_DO_TELEFONE).toEqual(["A", "B"]);
	});
});

describe("varianteDaVisita — determinística", () => {
	it("a MESMA visita cai SEMPRE na mesma variante (100 chamadas)", () => {
		const visitId = uuidDe(42);
		const primeira = varianteDaVisita(visitId);
		for (let i = 0; i < 100; i++) {
			expect(varianteDaVisita(visitId)).toBe(primeira);
		}
	});

	it("o hash é estável entre chamadas (mesma semente ⇒ mesmo número)", () => {
		expect(hashDaSemente("abc-123")).toBe(hashDaSemente("abc-123"));
		expect(hashDaSemente("abc-123")).not.toBe(hashDaSemente("abc-124"));
	});

	it("visitas diferentes distribuem nos DOIS lados (amostra grande)", () => {
		const contagem: Record<VarianteDoTelefone, number> = { A: 0, B: 0 };
		const N = 5_000;
		for (let i = 0; i < N; i++) {
			contagem[varianteDaVisita(uuidDe(i))]++;
		}
		// 50/50 num FNV-1a de UUID: folga generosa, mas nunca um lado vazio.
		expect(contagem.A).toBeGreaterThan(N * 0.4);
		expect(contagem.B).toBeGreaterThan(N * 0.4);
		expect(contagem.A + contagem.B).toBe(N);
	});

	it("não usa `Math.random()` — o resultado é derivado só da semente", () => {
		const visitId = uuidDe(7);
		const primeiro = varianteDaVisita(visitId);
		// quebra o gerador global: se alguém reintroduzir sorteio, isto falha.
		const original = Math.random;
		Math.random = () => {
			throw new Error("Math.random() não pode ser chamado na atribuição da variante");
		};
		try {
			expect(varianteDaVisita(visitId)).toBe(primeiro);
		} finally {
			Math.random = original;
		}
	});
});

describe("varianteDaVisita — erro alto em semente inválida", () => {
	it("semente vazia ⇒ lança (nunca escolhe um caminho em silêncio)", () => {
		expect(() => varianteDaVisita("")).toThrow(/semente/i);
		expect(() => varianteDaVisita("   ")).toThrow(/semente/i);
	});

	it("semente que não é string ⇒ lança", () => {
		// @ts-expect-error — contrato em runtime, testado de propósito
		expect(() => varianteDaVisita(null)).toThrow(/semente/i);
		// @ts-expect-error — contrato em runtime, testado de propósito
		expect(() => varianteDaVisita(undefined)).toThrow(/semente/i);
	});
});

describe("varianteDaConversa — visita primeiro, conversa como reserva", () => {
	it("prefere o visitId (a variante é da VISITA)", () => {
		const visitId = uuidDe(11);
		expect(varianteDaConversa({ visitId, conversationId: uuidDe(999) })).toBe(
			varianteDaVisita(visitId),
		);
	});

	it("sem visita, cai na conversa — estável, nunca aleatório", () => {
		const conversationId = uuidDe(5);
		const a = varianteDaConversa({ visitId: null, conversationId });
		const b = varianteDaConversa({ visitId: undefined, conversationId });
		expect(a).toBe(b);
		expect(a).toBe(varianteDaVisita(conversationId));
	});

	it("sem visita e sem conversa ⇒ lança", () => {
		expect(() => varianteDaConversa({ visitId: null, conversationId: "" })).toThrow(/semente/i);
	});

	it("visita vazia ('') NÃO conta como visita — cai na conversa", () => {
		const conversationId = uuidDe(3);
		expect(varianteDaConversa({ visitId: "", conversationId })).toBe(
			varianteDaVisita(conversationId),
		);
	});
});

describe("varianteDaConversa — a FILA manda no que o hash só chutava (FIX-434)", () => {
	it("`daFila` ganha do hash — é a alternância estrita da conversa web nova", () => {
		const visitId = uuidDe(21);
		const conversationId = uuidDe(22);
		// O braço OPOSTO ao do hash, para a asserção não passar por acaso.
		const peloHash = varianteDaVisita(visitId);
		const daFila: VarianteDoTelefone = peloHash === "A" ? "B" : "A";
		expect(varianteDaConversa({ visitId, conversationId, daFila })).toBe(daFila);
	});

	it("`forcar` (QA) ganha da fila — e o valor inválido é ignorado", () => {
		expect(varianteDaConversa({ visitId: uuidDe(23), forcar: "B", daFila: "A" })).toBe("B");
		expect(varianteDaConversa({ visitId: uuidDe(23), forcar: "C", daFila: "A" })).toBe("A");
	});

	it("sem fila (null/undefined), volta ao hash de sempre — não consome fila quem não é entrada nova", () => {
		const visitId = uuidDe(24);
		expect(varianteDaConversa({ visitId, daFila: null })).toBe(varianteDaVisita(visitId));
		expect(varianteDaConversa({ visitId, daFila: undefined })).toBe(varianteDaVisita(visitId));
	});
});

describe("lerVariante — variante persistida desconhecida ⇒ erro alto", () => {
	it("aceita B e C", () => {
		expect(lerVariante("A")).toBe("A");
		expect(lerVariante("B")).toBe("B");
	});

	it("recusa qualquer outra coisa (incluindo 'C' — variante que não existe)", () => {
		expect(() => lerVariante("C")).toThrow(/variante/i);
		expect(() => lerVariante("b")).toThrow(/variante/i);
		expect(() => lerVariante("")).toThrow(/variante/i);
		expect(() => lerVariante(null)).toThrow(/variante/i);
		expect(() => lerVariante(undefined)).toThrow(/variante/i);
		expect(() => lerVariante(1)).toThrow(/variante/i);
	});

	it("ehVarianteDoTelefone é o guard barato, sem lançar", () => {
		expect(ehVarianteDoTelefone("A")).toBe(true);
		expect(ehVarianteDoTelefone("B")).toBe(true);
		expect(ehVarianteDoTelefone("C")).toBe(false);
		expect(ehVarianteDoTelefone(null)).toBe(false);
	});
});
