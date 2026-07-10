// @vitest-environment happy-dom
/**
 * FIX-230 (docs/02-cards-novos.md CARD 2 — scarcity). Invariantes duros:
 * NUNCA exibe total de cotas nem razão N/total; barra é DECORATIVA (largura
 * fixa); sem `availableSlots` não renderiza (sem fallback/estimativa).
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScarcityPayload } from "@/lib/chat/types";
import { Scarcity } from "./scarcity";

const payload: ScarcityPayload = {
	groupCode: "grp-real-1",
	administradora: "CANOPUS",
	availableSlots: 3,
	disclaimer: "Número estimado, apenas indicativo.",
};

describe("Scarcity", () => {
	it("mostra 'restam apenas N'", () => {
		render(<Scarcity payload={payload} />);
		expect(screen.getByText(/restam apenas 3/i)).toBeTruthy();
	});

	it("NUNCA exibe total de cotas nem razão N/total", () => {
		render(<Scarcity payload={payload} />);
		const text = document.body.textContent ?? "";
		expect(text).not.toMatch(/\d+\s*\/\s*\d+/); // razão tipo "3/500"
		expect(text).not.toMatch(/total/i);
	});

	it("a barra é decorativa — largura fixa, não muda com availableSlots diferente", () => {
		const { container: c1 } = render(<Scarcity payload={{ ...payload, availableSlots: 1 }} />);
		const bar1 = c1.querySelector('[data-testid="scarcity-bar"]') as HTMLElement | null;
		document.body.innerHTML = "";
		const { container: c2 } = render(<Scarcity payload={{ ...payload, availableSlots: 6 }} />);
		const bar2 = c2.querySelector('[data-testid="scarcity-bar"]') as HTMLElement | null;
		expect(bar1?.style.width).toBeTruthy();
		expect(bar1?.style.width).toBe(bar2?.style.width);
	});

	it("sem availableSlots, NÃO renderiza (sem fallback/estimativa)", () => {
		const { container } = render(
			<Scarcity payload={{ ...payload, availableSlots: undefined as unknown as number }} />,
		);
		expect(container.firstChild).toBeNull();
	});
});
