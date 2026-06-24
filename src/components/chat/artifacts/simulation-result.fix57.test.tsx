// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SimulationResultPayload } from "@/lib/chat/types";
import { SimulationResult } from "./simulation-result";

// ============================================================================
// FIX-57 (jornada2_revisão.docx — teste manual Bernardo, 2026-06-19):
// "Ficou inconclusivo o que faz depois?" + "deveria ir aumentando os meses e
// reduzindo o lance". O card terminava só com "Tenho interesse" (parece um fim,
// não um avançar) e não explicava a relação meses×lance (stakeholder achou que
// era "regra do grupo"). A mecânica em contemplation-dial.ts está CORRETA — aqui
// é só clareza/comunicação: (1) sinalizar o próximo passo, (2) microcopy do lance.
// ============================================================================

vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction: vi.fn(), status: "ready" }),
}));

const base: SimulationResultPayload = {
	groupId: "grp-1",
	administradora: "Rodobens",
	category: "auto",
	creditValue: 90_000,
	monthlyPayment: 1_200,
	adminFee: 16_200,
	reserveFund: 3_375,
	insurance: 4_500,
	totalCost: 114_075,
	termMonths: 80,
	effectiveRate: 22,
	lanceScenario: { lancePercent: 20, expectedTermMonths: 40 },
};

describe("FIX-57 — próximo passo explícito + clareza meses×lance", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("sinaliza o PRÓXIMO PASSO além de 'Tenho interesse' (não é beco sem saída)", () => {
		render(<SimulationResult payload={base} />);
		const hint = screen.getByTestId("proximo-passo-hint");
		expect(hint).toBeDefined();
		expect(hint.textContent ?? "").toMatch(/pr[óo]ximo passo/i);
	});

	it("explica a relação meses×lance (mais meses → menos lance) — sem mudar o cálculo", () => {
		render(<SimulationResult payload={base} />);
		const hint = screen.getByTestId("meses-lance-hint");
		const txt = hint.textContent ?? "";
		expect(txt).toMatch(/lance/i);
		expect(txt).toMatch(/meses|contempla/i);
	});

	it("microcopy meses×lance só aparece quando há cenário de lance", () => {
		const { lanceScenario, ...semLance } = base;
		render(<SimulationResult payload={semLance as SimulationResultPayload} />);
		expect(screen.queryByTestId("meses-lance-hint")).toBeNull();
	});

	it("o próximo-passo NÃO substitui 'Tenho interesse' — os dois coexistem", () => {
		render(<SimulationResult payload={base} />);
		expect(screen.getByTestId("tenho-interesse-cta")).toBeDefined();
		expect(screen.getByTestId("proximo-passo-hint")).toBeDefined();
	});
});
