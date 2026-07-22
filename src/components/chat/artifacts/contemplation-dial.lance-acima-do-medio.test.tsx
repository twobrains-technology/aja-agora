// @vitest-environment happy-dom
/**
 * BUG-LANCE-ACIMA-DO-MEDIO (sessão 2026-07-21, oferta Itaú real) — a agulha da web.
 *
 * O card exibia "Lance médio R$ 164.591,11" e a agulha, arrastada pros meses
 * iniciais, pedia R$ 190.132,20 (90%) — R$ 25 mil ACIMA do único número que a
 * administradora sustenta. Dois furos no caminho da web:
 *   1. o componente NÃO repassava `avgBidValue` pro motor (o payload já o
 *      carregava desde o FIX-40) — o teto de evidência nunca chegava na agulha;
 *   2. quando a curva estoura o observado, a UI mostrava o teto como se fosse
 *      estimativa, sem dizer que ali não há número que se sustente.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ContemplationDialPayload } from "@/lib/chat/types";
import { ContemplationDial } from "./contemplation-dial";

// Oferta real da sessão: Itaú, automóvel, carta R$ 211.258, 48 meses.
// Sem referenceMonth (a Bevi não manda — Pendência P5) → âncora heurística = 12.
const itau: ContemplationDialPayload = {
	administradora: "ITAÚ",
	category: "auto",
	creditValue: 211_258,
	termMonths: 48,
	monthlyPayment: 5_377.25,
	avgBidValue: 164_591.11,
	initialTargetMonth: 5,
};

beforeEach(() => {
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("BUG-LANCE-ACIMA-DO-MEDIO — a agulha nunca mostra lance acima do médio da oferta", () => {
	it("no mês 5 NÃO exibe os R$ 190.132 extrapolados", () => {
		render(<ContemplationDial payload={itau} />);
		const text = document.body.textContent ?? "";
		expect(text).not.toContain("190.132");
		expect(text).not.toContain("190.133");
	});

	it("no mês 5 exibe o lance médio observado (o teto), não o teto de 90%", () => {
		render(<ContemplationDial payload={itau} />);
		const text = document.body.textContent ?? "";
		expect(text).toContain("164.591");
		expect(text).not.toMatch(/\(90%\)/);
	});

	it("avisa que ali não há estimativa possível e diz a partir de quando há", () => {
		render(<ContemplationDial payload={itau} />);
		const aviso = document.querySelector('[data-testid="dial-beyond-evidence"]');
		expect(aviso).not.toBeNull();
		// tem que dizer o mês a partir do qual o histórico sustenta (âncora = 12)
		expect(aviso?.textContent ?? "").toContain("12");
	});

	it("num mês que o histórico sustenta, nenhum aviso aparece (não polui o caso normal)", () => {
		render(<ContemplationDial payload={{ ...itau, initialTargetMonth: 24 }} />);
		expect(document.querySelector('[data-testid="dial-beyond-evidence"]')).toBeNull();
	});
});
