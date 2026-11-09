// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendAction = vi.fn();
vi.mock("@/lib/chat/provider", () => ({
	useChatContext: () => ({ sendAction, status: "ready" as const, messages: [] }),
}));

import { GroupCard } from "./group-card";

afterEach(cleanup);

const PAYLOAD = {
	id: "g1",
	administradora: "CANOPUS",
	category: "auto" as const,
	creditValue: 240_000,
	monthlyPayment: 2_100,
	adminFeePercent: 18,
	termMonths: 116,
	availableSlots: 3,
};

describe("GroupCard — clique", () => {
	it("o botão não diz simular e o clique envia a fala de interesse", () => {
		render(<GroupCard payload={PAYLOAD} />);
		expect(screen.queryByText(/simular/i)).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: /Tenho interesse/ }));
		expect(sendAction).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "select-group", groupId: "g1", termMonths: 116 }),
			"Me interessei na CANOPUS de R$ 240 mil, prazo de 116 meses",
		);
	});
});
