// @vitest-environment happy-dom
/**
 * FIX-231 (handoff 2026-07-09, docs/02-cards-novos.md "Ajustes nos cards que
 * já existem"): a carta de crédito é o que o cliente compra — precisa ser o
 * hero visual do card (fonte grande), com a parcela abaixo, discreta. Lance
 * médio vira linha de detalhe própria, fora do grid de métricas.
 *
 * Bug real encontrado na exploração: o card mostrava `contemplationRate` com
 * `%` (ex. "36,0%"), mas o dado é `monthlyAwardedQuotas` — uma CONTAGEM real
 * de contemplados/mês (offer-mapper.ts:132-133), nunca uma fração. Corrige
 * pro mesmo padrão do recommendation-card ("Contemplados/mês").
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroupCardPayload } from "@/lib/chat/types";
import { GroupCard } from "./group-card";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

const payload: GroupCardPayload = {
	id: "grp-1",
	administradora: "ÂNCORA",
	category: "auto",
	creditValue: 100_000,
	monthlyPayment: 1_500,
	adminFeePercent: 18,
	termMonths: 80,
	availableSlots: 36,
	contemplationRate: 36,
};

describe("GroupCard — carta em destaque, parcela discreta (FIX-231)", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("a carta (valor do bem) é o hero — fonte maior que a parcela", () => {
		render(<GroupCard payload={payload} />);
		const hero = screen.getByTestId("group-card-hero-credit");
		const secondary = screen.getByTestId("group-card-secondary-payment");
		expect(hero.textContent).toMatch(/100\.000/);
		expect(secondary.textContent).toMatch(/1\.500/);
		// hero precisa ter uma classe de tamanho maior que a secundária.
		const heroSizeClass = [...hero.classList].find((c) => /^text-(xl|2xl|3xl|\[.*rem\])/.test(c));
		const secondarySizeClass = [...secondary.classList].find((c) =>
			/^text-(xs|sm|base|lg|xl)$/.test(c),
		);
		expect(heroSizeClass).toBeTruthy();
		expect(secondarySizeClass).toBeTruthy();
	});

	it("lance médio vira linha discreta fora do grid de métricas", () => {
		render(<GroupCard payload={{ ...payload, avgBidValue: 4_200 }} />);
		const lance = screen.getByTestId("group-card-lance-medio");
		expect(lance.textContent).toMatch(/lance m[ée]dio/i);
		expect(lance.textContent).toMatch(/4\.200/);
	});

	it("NUNCA exibe contemplação como percentual — mostra contagem 'contemplados/mês'", () => {
		render(<GroupCard payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).not.toMatch(/contempla[çc][ãa]o[^a-zA-Z]*36[,.]0?%/i);
		expect(screen.getByText(/contemplados\/m[êe]s/i)).toBeTruthy();
		expect(screen.getByText(/36 por m[êe]s/i)).toBeTruthy();
	});

	it("omite a linha de contemplação quando a contagem é 0", () => {
		render(<GroupCard payload={{ ...payload, contemplationRate: 0 }} />);
		expect(screen.queryByText(/contemplados\/m[êe]s/i)).toBeNull();
	});
});
