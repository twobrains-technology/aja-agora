// @vitest-environment happy-dom
/**
 * Camada 1 — FIX-C1/C4/C5 no componente do dial (auditoria Kairo 2026-06-11).
 * Com os dados REAIS da oferta BB: dial calibrado no par (49,28% · 6 meses),
 * parcela real até contemplar + estimada depois (sem fantasia), e confronto
 * do lance declarado do usuário.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ContemplationDialPayload } from "@/lib/chat/types";
import { ContemplationDial } from "./contemplation-dial";

const payload: ContemplationDialPayload = {
	administradora: "BANCO DO BRASIL",
	category: "auto",
	creditValue: 262_309.8,
	termMonths: 34,
	monthlyPayment: 9_828.92,
	historicalWinningBidPct: 49.28,
	referenceMonth: 6,
	maxEmbutidoPct: 49.28,
	initialTargetMonth: 6,
	declaredLanceValue: 117_000,
};

beforeEach(() => {
	document.body.innerHTML = "";
});

afterEach(() => {
	cleanup();
});

describe("FIX-C1 — dial calibrado no dado real (card e dial dizem o MESMO)", () => {
	it("no mês 6 mostra ~49% (o lance real da oferta), nunca os 74% extrapolados", () => {
		render(<ContemplationDial payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).toContain("49%");
		expect(text).not.toContain("74%");
	});
});

describe("FIX-C4 — parcela honesta", () => {
	it("mostra a parcela REAL até a contemplação (não a fantasia reduzida)", () => {
		render(<ContemplationDial payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).toMatch(/até contemplar/i);
		// FIX-242: parcela NUNCA arredonda (CDC art. 30) — 9.828,92 literal, não
		// mais os "9.829" que o brl(0 decimais) arredondava.
		expect(text).toContain("9.828,92");
		// a fantasia do bug real (9.829 × (1−0,74) = 2.556) não existe mais
		expect(text).not.toContain("2.556");
	});

	it("FIX-221 (Ata 2026-07-04): lance 100% embutido → parcela estimada DEPOIS CAI (embutido amortiza o saldo)", () => {
		render(<ContemplationDial payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).toMatch(/depois/i);
		// "Até contemplar" continua a parcela real (R$ 9.829); "Após receber" agora
		// cai pra ~R$ 5.212 (jornada-canonica.md D9 fala em ~5.238, calculado com o
		// lance arredondado a 49%; com o bidPercentage fiel da oferta — 49,28%,
		// BUG-LANCE-ACIMA-DO-MEDIO defeito 2 — o abatimento é maior). Nunca mais
		// idêntica à de antes (PENDENTE-Bernardo validar o número exato antes de prod).
		expect(text).toMatch(/5\.212/);
	});
});

describe("FIX-C5 — confronto do lance declarado", () => {
	it("lance declarado cobre a parte em dinheiro → afirma que cobre", () => {
		// embutido real (49.28%) cobre tudo → bolso 0 → declarado cobre
		render(<ContemplationDial payload={payload} />);
		expect(document.body.textContent).toMatch(/cobre/i);
	});

	it("lance declarado insuficiente → mostra o gap sem esconder", () => {
		render(
			<ContemplationDial
				payload={{ ...payload, maxEmbutidoPct: 30, declaredLanceValue: 10_000 }}
			/>,
		);
		// bolso = (49−30)% de 262k ≈ 50k > 10k declarado
		expect(document.body.textContent).toMatch(/não cobre|nao cobre/i);
	});

	it("sem lance declarado no payload → linha de confronto não aparece", () => {
		const { declaredLanceValue: _omit, ...rest } = payload;
		render(<ContemplationDial payload={rest as ContemplationDialPayload} />);
		expect(document.body.textContent).not.toMatch(/cobre/i);
	});
});
