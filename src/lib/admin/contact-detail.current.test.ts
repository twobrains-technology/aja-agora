// FIX-50 (Camada 1) — derivação do "presente" na visão do contato: qual proposta
// é a VIGENTE e qual conversa está ATIVA. Puras (sem DB).

import { describe, expect, it } from "vitest";
import { deriveActiveConversationId, deriveCurrentProposalId } from "./contact-detail";

describe("FIX-50 — deriveCurrentProposalId (proposta vigente)", () => {
	it("escolhe a mais avançada não-terminal (pela raia do lead), ignorando perdida", () => {
		const stageById = new Map([
			["lead-perdida", "perdido"],
			["lead-ativa", "proposta_enviada"],
			["lead-sim", "qualificado"],
		]);
		const proposals = [
			{ id: "p-perdida", leadId: "lead-perdida", createdAt: "2026-06-15T12:00:00Z" },
			{ id: "p-ativa", leadId: "lead-ativa", createdAt: "2026-06-15T10:00:00Z" },
			{ id: "p-sim", leadId: "lead-sim", createdAt: "2026-06-15T11:00:00Z" },
		];
		expect(deriveCurrentProposalId(proposals, stageById)).toBe("p-ativa");
	});

	it("desempata por recência quando a raia é igual", () => {
		const stageById = new Map([
			["l1", "proposta_enviada"],
			["l2", "proposta_enviada"],
		]);
		const proposals = [
			{ id: "p-velha", leadId: "l1", createdAt: "2026-06-15T08:00:00Z" },
			{ id: "p-nova", leadId: "l2", createdAt: "2026-06-15T18:00:00Z" },
		];
		expect(deriveCurrentProposalId(proposals, stageById)).toBe("p-nova");
	});

	it("todas perdidas → ainda marca a mais recente (não deixa o card órfão)", () => {
		const stageById = new Map([
			["l1", "perdido"],
			["l2", "perdido"],
		]);
		const proposals = [
			{ id: "p1", leadId: "l1", createdAt: "2026-06-15T08:00:00Z" },
			{ id: "p2", leadId: "l2", createdAt: "2026-06-15T09:00:00Z" },
		];
		expect(deriveCurrentProposalId(proposals, stageById)).toBe("p2");
	});

	it("sem propostas → null", () => {
		expect(deriveCurrentProposalId([], new Map())).toBeNull();
	});
});

describe("FIX-50 — deriveActiveConversationId (conversa em curso)", () => {
	it("escolhe a conversa active mais recente", () => {
		const convs = [
			{ id: "c-encerrada", status: "closed", updatedAt: "2026-06-15T20:00:00Z" },
			{ id: "c-ativa-velha", status: "active", updatedAt: "2026-06-15T10:00:00Z" },
			{ id: "c-ativa-nova", status: "active", updatedAt: "2026-06-15T18:00:00Z" },
		];
		expect(deriveActiveConversationId(convs)).toBe("c-ativa-nova");
	});

	// 2026-08-10 — INVERSÃO do que este teste cravava antes ("handed_off → null").
	//
	// `handed_off` é a conversa que um HUMANO está atendendo agora: a mais em
	// curso que existe. Tratá-la como "nenhuma conversa ativa" fazia a tela do
	// atendente não ter conversa nenhuma pra acompanhar — o SSE e o polling do
	// refresh ao vivo recebiam `null` e simplesmente não ligavam. O atendente
	// ficava olhando uma conversa parada enquanto o cliente escrevia.
	it("conversa entregue a um humano CONTA como em curso — é a que está sendo atendida", () => {
		const convs = [
			{ id: "c-encerrada", status: "closed", updatedAt: "2026-06-15T20:00:00Z" },
			{ id: "c-em-atendimento", status: "handed_off", updatedAt: "2026-06-15T11:00:00Z" },
		];
		expect(deriveActiveConversationId(convs)).toBe("c-em-atendimento");
	});

	it("entre uma active e uma handed_off, vale a mais recente", () => {
		const convs = [
			{ id: "c-active", status: "active", updatedAt: "2026-06-15T10:00:00Z" },
			{ id: "c-handed-off", status: "handed_off", updatedAt: "2026-06-15T18:00:00Z" },
		];
		expect(deriveActiveConversationId(convs)).toBe("c-handed-off");
	});

	it("só conversa encerrada → null", () => {
		const convs = [
			{ id: "c1", status: "closed", updatedAt: "2026-06-15T10:00:00Z" },
			{ id: "c2", status: "closed", updatedAt: "2026-06-15T11:00:00Z" },
		];
		expect(deriveActiveConversationId(convs)).toBeNull();
	});
});
