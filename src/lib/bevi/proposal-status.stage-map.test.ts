// Camada 1 (structural, puro) — FIX-44: máquina de estados do desfecho.
// stageForProposalStatus mapeia o status REAL da administradora → raia do funil,
// exatamente como a tabela fornecida pelo Kairo (2026-06-14).

import { describe, expect, it } from "vitest";
import type { ProposalStatus } from "@/lib/adapters/proposal-gateway";
import { PROPOSAL_STATUS_TO_STAGE, stageForProposalStatus } from "./proposal-status";

function status(partial: Partial<ProposalStatus> & { systemicValue?: string }): ProposalStatus {
	const { systemicValue, ...rest } = partial;
	return {
		proposalId: "p1",
		statusName: "x",
		situation: "pending",
		statusDescription: null,
		integrationCode: null,
		createdAt: "2026-06-14T00:00:00Z",
		updatedAt: "2026-06-14T00:00:00Z",
		approvedAt: null,
		reprovedAt: null,
		changesHistory: systemicValue ? [{ newState: { systemicValue } }] : [],
		...rest,
	};
}

describe("FIX-44 — PROPOSAL_STATUS_TO_STAGE (tabela do Kairo)", () => {
	it("mapeia exatamente os 5 estados do desfecho", () => {
		expect(PROPOSAL_STATUS_TO_STAGE).toEqual({
			approveWaitingForUniqueCode: "na_administradora",
			aguard_pag_cliente: "aguardando_pagamento",
			prop_efetivada: "fechado_ganho",
			approved: "fechado_ganho",
			repproved: "perdido",
		});
	});
});

describe("FIX-44 — stageForProposalStatus", () => {
	it("approveWaitingForUniqueCode → na_administradora", () => {
		expect(stageForProposalStatus(status({ systemicValue: "approveWaitingForUniqueCode" }))).toBe(
			"na_administradora",
		);
	});

	it("aguard_pag_cliente → aguardando_pagamento", () => {
		expect(stageForProposalStatus(status({ systemicValue: "aguard_pag_cliente" }))).toBe(
			"aguardando_pagamento",
		);
	});

	it("prop_efetivada → fechado_ganho", () => {
		expect(stageForProposalStatus(status({ systemicValue: "prop_efetivada" }))).toBe(
			"fechado_ganho",
		);
	});

	it("approvedAt preenchido → fechado_ganho (precedência sobre history)", () => {
		expect(
			stageForProposalStatus(status({ approvedAt: "2026-06-14", systemicValue: "aguard_pag_cliente" })),
		).toBe("fechado_ganho");
	});

	it("reprovedAt preenchido → perdido (precedência máxima)", () => {
		expect(stageForProposalStatus(status({ reprovedAt: "2026-06-14" }))).toBe("perdido");
	});

	it("repproved no history → perdido", () => {
		expect(stageForProposalStatus(status({ systemicValue: "repproved" }))).toBe("perdido");
	});

	it("integrationCode presente (sem systemicValue mapeado) → na_administradora", () => {
		expect(stageForProposalStatus(status({ integrationCode: "12345" }))).toBe("na_administradora");
	});

	it("estado de documentação pré-mesa (não move o funil) → null", () => {
		expect(stageForProposalStatus(status({ systemicValue: "comprovanteDeEndereco" }))).toBeNull();
		expect(stageForProposalStatus(status({}))).toBeNull();
	});
});
