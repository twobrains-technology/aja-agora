// @vitest-environment happy-dom
// QA autônomo Frente 3 (2026-07-01) — FIX-176: mesmo defeito do contact-detail-panel:
// STAGE_LABELS não tinha em_atendimento (raia nova do FIX-126, claim "Vou atender").
// Lead anônimo (sem contactId) usa ESTE painel — o badge mostrava o enum cru.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Lead } from "./lead-card";
import { LeadDetailPanel } from "./lead-detail-panel";

const LEAD: Lead = {
	id: "lead-em-atendimento",
	conversationId: "conv-em-atendimento",
	contactId: null,
	name: "Lead Sem Contato",
	phone: "62999998888",
	email: null,
	stage: "em_atendimento",
	creditValue: null,
	createdAt: new Date("2026-07-01T12:00:00Z").toISOString(),
	updatedAt: new Date("2026-07-01T12:00:00Z").toISOString(),
	conversation: {
		channel: "whatsapp",
		createdAt: new Date("2026-07-01T12:00:00Z").toISOString(),
		updatedAt: new Date("2026-07-01T12:00:00Z").toISOString(),
	},
};

afterEach(cleanup);

describe("FIX-176 — raia em_atendimento sem label legível (lead-detail-panel)", () => {
	it("badge do estágio mostra 'Em Atendimento', nunca o enum cru 'em_atendimento'", async () => {
		render(<LeadDetailPanel lead={LEAD} open onClose={() => {}} />);
		await waitFor(() => expect(screen.getByText("Em Atendimento")).toBeDefined());
		expect(screen.queryByText("em_atendimento")).toBeNull();
	});
});
