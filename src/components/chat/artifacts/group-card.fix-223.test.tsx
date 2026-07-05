// @vitest-environment happy-dom
/**
 * FIX-223 (Ata 2026-07-04, item 4.2): "Exibir o lance médio no card." Aplica
 * também ao group-card (1ª lista, mesmo peso — FIX-220), quando presente.
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
	availableSlots: 2,
	contemplationRate: 2,
};

describe("FIX-223 — lance médio no group-card", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	it("exibe 'Lance médio' quando avgBidValue está presente", () => {
		render(<GroupCard payload={{ ...payload, avgBidValue: 4_200 }} />);
		expect(screen.getByText(/lance m[ée]dio/i)).toBeTruthy();
	});

	it("omite a linha quando avgBidValue está ausente (nunca fabrica)", () => {
		render(<GroupCard payload={payload} />);
		expect(screen.queryByText(/lance m[ée]dio/i)).toBeNull();
	});
});
