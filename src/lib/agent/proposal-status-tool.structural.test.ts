// Camada 1 — FIX-14: anti-regressão estrutural da tool check_proposal_status.
// Plano de teste: docs/test-plans/fix-14-tool-status-proposta.md (CA-15..CA-20).
// Asserts contra a fonte de produção (registry/factory/builder/prompt) — sem DB
// (PersonaRow literal, padrão CINTO+SUSPENSÓRIO do builder).

import { describe, expect, it, vi } from "vitest";
import { buildAgent } from "./agents/builder";
import { type PersonaRow, SPECIALIST_BASE_PROMPT } from "./system-prompt";
import { buildConsorcioTools, consorcioTools } from "./tools/ai-sdk";

vi.mock("@/lib/bevi/proposal-status", () => ({
	checkProposalStatus: vi.fn(async (conversationId: string) => ({
		ok: true,
		hasProposal: true,
		userMessage: `stub-status-${conversationId}`,
		lastTransition: null,
	})),
}));

function makePersonaRow(over: Partial<PersonaRow> = {}): PersonaRow {
	return {
		id: "auto",
		displayName: "Bruno",
		role: "specialist",
		category: "auto",
		expertise: null,
		voiceTone: "consultivo",
		examples: [],
		temperature: 0.7,
		activeCampaigns: [],
		handoffTriggers: [],
		forbiddenTopics: [],
		activeTools: [], // de propósito VAZIO — a tool tem que entrar mesmo assim (primitivo)
		isActive: true,
		version: 1,
		createdAt: new Date("2026-06-05T00:00:00Z"),
		updatedAt: new Date("2026-06-05T00:00:00Z"),
		...over,
	};
}

describe("FIX-14 — registry e schema da tool (CA-15/CA-16)", () => {
	it("CA-15: check_proposal_status existe no registry estático consorcioTools", () => {
		expect(consorcioTools).toHaveProperty("check_proposal_status");
	});

	it("CA-15: execute estático (sem contexto) responde sentinel — não toca DB/gateway", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: introspecção da tool em teste
		const staticTool = (consorcioTools as any).check_proposal_status;
		const result = await staticTool.execute({});
		expect(JSON.stringify(result)).toMatch(/sem conversationId|indisponivel neste contexto/i);
	});

	it("CA-16: inputSchema tem ZERO campos — modelo não tem como alucinar proposalId", () => {
		// biome-ignore lint/suspicious/noExplicitAny: introspecção do zod shape
		const schema = (consorcioTools as any).check_proposal_status.inputSchema;
		expect(Object.keys(schema.shape ?? {})).toEqual([]);
	});
});

describe("FIX-14 — factory closure (CA-17)", () => {
	it("CA-17: com conversationId, execute chama checkProposalStatus(conversationId) via closure", async () => {
		const registry = buildConsorcioTools({ conversationId: "conv-fix14" });
		// biome-ignore lint/suspicious/noExplicitAny: introspecção da tool em teste
		const result = await (registry as any).check_proposal_status.execute({});
		const { checkProposalStatus } = await import("@/lib/bevi/proposal-status");
		expect(checkProposalStatus).toHaveBeenCalledWith("conv-fix14");
		expect(JSON.stringify(result)).toContain("stub-status-conv-fix14");
	});

	it("CA-17: sem conversationId (admin/preview) → resposta segura sem chamar serviço", async () => {
		const registry = buildConsorcioTools({});
		// biome-ignore lint/suspicious/noExplicitAny: introspecção da tool em teste
		const result = await (registry as any).check_proposal_status.execute({});
		expect(JSON.stringify(result)).toMatch(/sem conversationId|indisponivel neste contexto/i);
	});
});

describe("FIX-14 — builder sempre expõe a tool pro specialist (CA-18)", () => {
	it("CA-18: specialist com activeTools VAZIO ainda recebe check_proposal_status", () => {
		const agent = buildAgent(makePersonaRow());
		// biome-ignore lint/suspicious/noExplicitAny: introspecção das tools do agent
		const tools = (agent as any).tools as Record<string, unknown>;
		expect(Object.keys(tools)).toContain("check_proposal_status");
	});

	it("CA-18: concierge NÃO recebe a tool", () => {
		const agent = buildAgent(makePersonaRow({ role: "concierge", category: null }));
		// biome-ignore lint/suspicious/noExplicitAny: introspecção das tools do agent
		const tools = (agent as any).tools as Record<string, unknown>;
		expect(Object.keys(tools ?? {})).not.toContain("check_proposal_status");
	});
});

describe("FIX-14 — regra de status no SPECIALIST_BASE_PROMPT (CA-19/CA-20)", () => {
	it("CA-19: pergunta de status → SEMPRE check_proposal_status", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(/status[\s\S]{0,300}check_proposal_status/i);
	});

	it("CA-20: PROIBIDO responder status de memória", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/check_proposal_status[\s\S]{0,600}(de mem[oó]ria|sem chamar a tool)/i,
		);
	});

	it("CA-20: PROIBIDO re-buscar grupos pra pergunta de status", () => {
		expect(SPECIALIST_BASE_PROMPT).toMatch(
			/check_proposal_status[\s\S]{0,600}(search_groups|recommend_groups|re-?buscar)/i,
		);
	});
});
