// @vitest-environment happy-dom
/**
 * FIX-222, fecho (31/08/2026): o logo chega ao COMPARADOR.
 *
 * O pipeline do FIX-222 existia desde 04/07 e alimentava só `group-card` e
 * `recommendation-card`. O `comparison-table` — que é onde o cliente compara
 * quatro administradoras lado a lado, e portanto onde a marca mais rende
 * confiança — nunca usou logo: mostrava o nome em texto.
 *
 * Decisão do Kairo (31/08): o logo SUBSTITUI o nome no chip. O lockup já
 * contém o nome da marca, e repetir "ITAÚ" embaixo do logo do Itaú gastaria
 * duas vezes os ~124px úteis do chip com a mesma informação. O nome continua
 * no `aria-label` do botão, que é o que o leitor de tela anuncia.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComparisonTablePayload } from "@/lib/chat/types";
import { ComparisonTable } from "./comparison-table";

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

type Grupo = ComparisonTablePayload["groups"][number];

// Sem spread de Partial: com `exactOptionalPropertyTypes`, espalhar um Partial
// injeta `undefined` explícito nas opcionais e o tipo deixa de casar.
const grupo = (id: string, administradora: string, logoUrl?: string): Grupo => {
	const base: Grupo = {
		id,
		administradora,
		category: "auto",
		creditValue: 81_973,
		monthlyPayment: 1992.78,
		adminFeePercent: 18,
		termMonths: 48,
		availableSlots: 7,
		avgBidValue: 56_717,
	};
	return logoUrl ? { ...base, logoUrl } : base;
};

const renderTabela = (payload: ComparisonTablePayload) =>
	render(<ComparisonTable payload={payload} />);

afterEach(() => {
	cleanup();
});

describe("comparison-table — logo da administradora no chip", () => {
	it("com logoUrl, mostra o logo e NÃO repete o nome em texto", () => {
		renderTabela({ groups: [grupo("g1", "ITAÚ", "/administradoras/itau.svg")] });

		const logo = screen.getByRole("img", { name: /itaú/i });
		expect(logo).toHaveProperty("src", expect.stringContaining("/administradoras/itau.svg"));
		// o nome não aparece duas vezes: só o logo carrega a marca no chip
		expect(screen.queryByText("ITAÚ")).toBeNull();
	});

	it("o nome continua anunciado pelo leitor de tela, mesmo sem texto na tela", () => {
		renderTabela({ groups: [grupo("g1", "ITAÚ", "/administradoras/itau.svg")] });
		expect(screen.getByRole("button", { name: /itaú/i })).toBeTruthy();
	});

	it("sem logoUrl, cai no nome em texto — o chip nunca fica sem identificação", () => {
		renderTabela({ groups: [grupo("g1", "EMBRACON")] });
		expect(screen.getByText("EMBRACON")).toBeTruthy();
		expect(screen.queryByRole("img")).toBeNull();
	});

	it("cada chip da comparação traz o seu próprio logo", () => {
		renderTabela({
			groups: [
				grupo("g1", "ITAÚ", "/administradoras/itau.svg"),
				grupo("g2", "RODOBENS", "/administradoras/rodobens.svg"),
			],
		});
		expect(screen.getByRole("img", { name: /itaú/i })).toBeTruthy();
		expect(screen.getByRole("img", { name: /rodobens/i })).toBeTruthy();
	});
});

describe("AdministradoraLogo — lockup horizontal, não medalhão", () => {
	it("o logo do comparador não é recortado em círculo", async () => {
		const { AdministradoraLogo } = await import("./administradora-logo");
		render(
			<AdministradoraLogo
				administradora="RODOBENS"
				logoUrl="/administradoras/rodobens.svg"
				formato="lockup"
			/>,
		);
		const img = screen.getByRole("img", { name: /rodobens/i });
		// rounded-full num lockup de 6:1 achata a marca até virar tarja ilegível
		expect(img.className).not.toContain("rounded-full");
		expect(img.className).toContain("w-auto");
	});
});
