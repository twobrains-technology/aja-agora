// @vitest-environment happy-dom
/**
 * FIX-222 (Ata 2026-07-04): logo da administradora no group-card. Assets
 * reais são PENDENTE — cai no fallback (iniciais) sem quebrar.
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
	administradora: "BANCO DO BRASIL",
	category: "auto",
	creditValue: 100_000,
	monthlyPayment: 1_500,
	adminFeePercent: 18,
	termMonths: 80,
	availableSlots: 2,
	contemplationRate: 2,
};

describe("FIX-222 — logo da administradora no group-card", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("renderiza o logo quando logoUrl está presente", () => {
		render(<GroupCard payload={{ ...payload, logoUrl: "https://cdn/bb.png" }} />);
		const img = screen.getByRole("img", { name: /banco do brasil/i });
		expect(img).toHaveProperty("src", "https://cdn/bb.png");
	});

	it("sem logoUrl: cai no fallback (iniciais) sem quebrar", () => {
		render(<GroupCard payload={payload} />);
		expect(screen.queryByRole("img", { name: /banco do brasil/i })).toBeNull();
		expect(screen.getByText("BA")).toBeTruthy();
	});
});
