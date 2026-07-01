/**
 * FIX-181 (Mirella, 2026-07-01) — observabilidade de tool I/O (args + resultado
 * por chamada) via `onStepFinish` do AI SDK 6.
 *
 * Na investigação da conv 69a38af1 em prod, NÃO deu pra provar se "Embracon" foi
 * um grupo real não-exibido ou um nome confabulado — porque o sistema só logava
 * um turn-trace agregado, nunca os ARGUMENTOS nem o RESULTADO de cada tool-call.
 * "A IA inventou ou pegou de dado real?" ficou indeterminável (viola a Lei 5 de
 * ~/.claude/reference/arquitetura-agentes-ia.md).
 *
 * Este módulo loga `toolCalls` (args) + `toolResults` (output) por passo,
 * estruturado (JSON grepável), ligado ao conversationId, com PII mascarada
 * (CPF/celular/documentos — LGPD). Camada 1 (structural) + unit do masker.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildToolIoLogLines, logToolIO, maskPii } from "./tool-io-log";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-181 — maskPii (LGPD: CPF/celular/documentos nunca em claro no log)", () => {
	it("redige por CHAVE sensível (cpf, phone, celular, email, documento) recursivamente", () => {
		const masked = maskPii({
			name: "Mirella",
			cpf: "529.982.247-25",
			phone: "62999996793",
			nested: { celular: "11988887777", email: "mirella@example.com", documento: "RG123" },
		}) as Record<string, unknown>;

		expect(masked.cpf).toBe("[REDACTED]");
		expect(masked.phone).toBe("[REDACTED]");
		const nested = masked.nested as Record<string, unknown>;
		expect(nested.celular).toBe("[REDACTED]");
		expect(nested.email).toBe("[REDACTED]");
		expect(nested.documento).toBe("[REDACTED]");
		// nome do primeiro nome não é o alvo do card (CPF/celular/documentos) — preservado.
		expect(masked.name).toBe("Mirella");
	});

	it("redige por PADRÃO (CPF/telefone) em valores string sob chaves não-óbvias", () => {
		const masked = maskPii({
			reason: "Cliente 529.982.247-25 pediu retorno no (62) 99999-6793",
		}) as Record<string, unknown>;
		expect(masked.reason).not.toMatch(/529\.982\.247-25/);
		expect(masked.reason).not.toMatch(/99999-6793/);
		expect(masked.reason).toMatch(/\[CPF\]/);
	});

	it("NÃO mexe em dados não-sensíveis: groupId opaco, valores numéricos, categoria", () => {
		const masked = maskPii({
			groupId: "6a0ca9c73e68cce9b61d30fd",
			creditValue: 106000,
			category: "auto",
			administradora: "Itaú",
		}) as Record<string, unknown>;
		expect(masked.groupId).toBe("6a0ca9c73e68cce9b61d30fd");
		expect(masked.creditValue).toBe(106000);
		expect(masked.category).toBe("auto");
		expect(masked.administradora).toBe("Itaú");
	});

	it("arrays e valores primitivos passam sem quebrar", () => {
		expect(maskPii(["a", 1, null, true])).toEqual(["a", 1, null, true]);
		expect(maskPii(null)).toBeNull();
		expect(maskPii(42)).toBe(42);
	});
});

describe("FIX-181 — buildToolIoLogLines (args + resultado por tool-call, pareados)", () => {
	it("emite 1 linha JSON por tool-call com tool+input+output+conversation_id+step", () => {
		const lines = buildToolIoLogLines({
			conversationId: "conv-abc",
			stepNumber: 2,
			toolCalls: [{ toolCallId: "tc-1", toolName: "simulate_quota", input: { groupId: "xyz", creditValue: 106000 } }],
			toolResults: [{ toolCallId: "tc-1", toolName: "simulate_quota", output: { monthlyPayment: 1500 } }],
		});
		expect(lines).toHaveLength(1);
		const rec = JSON.parse(lines[0]);
		expect(rec.source).toBe("tool-io");
		expect(rec.conversation_id).toBe("conv-abc");
		expect(rec.step).toBe(2);
		expect(rec.tool).toBe("simulate_quota");
		expect(rec.input).toEqual({ groupId: "xyz", creditValue: 106000 });
		expect(rec.output).toEqual({ monthlyPayment: 1500 });
	});

	it("PROVA a cura da indeterminabilidade do 'Embracon': o RESULTADO cru de recommend_groups fica logado", () => {
		// O bug: no turno da Mirella não dava pra saber se "Embracon" veio do
		// recommend_groups (real, não-exibido) ou foi confabulado. Com o output
		// logado, a pergunta passa a ser RESPONDÍVEL.
		const lines = buildToolIoLogLines({
			conversationId: "conv-69a38af1",
			stepNumber: 0,
			toolCalls: [{ toolCallId: "tc-r", toolName: "recommend_groups", input: { category: "auto", creditMax: 106000, budget: 900 } }],
			toolResults: [
				{
					toolCallId: "tc-r",
					toolName: "recommend_groups",
					output: { recommendations: [{ id: "grp-1", administradora: "Itaú" }, { id: "grp-2", administradora: "Embracon" }], total: 2 },
				},
			],
		});
		const rec = JSON.parse(lines[0]);
		const admins = (rec.output.recommendations as Array<{ administradora: string }>).map((r) => r.administradora);
		// Determinável: agora dá pra provar se "Embracon" saiu do dado real da Bevi.
		expect(admins).toContain("Embracon");
	});

	it("mascara PII no input logado (capture_lead com phone/email)", () => {
		const lines = buildToolIoLogLines({
			conversationId: "conv-abc",
			stepNumber: 1,
			toolCalls: [{ toolCallId: "tc-l", toolName: "capture_lead", input: { name: "Mirella", phone: "62999996793", email: "m@x.com" } }],
			toolResults: [{ toolCallId: "tc-l", toolName: "capture_lead", output: "Lead capturado" }],
		});
		const rec = JSON.parse(lines[0]);
		expect(rec.input.phone).toBe("[REDACTED]");
		expect(rec.input.email).toBe("[REDACTED]");
		expect(JSON.stringify(rec)).not.toContain("62999996793");
	});

	it("tool-call sem resultado pareado ainda loga (output null) — nunca engole a chamada", () => {
		const lines = buildToolIoLogLines({
			conversationId: "c",
			stepNumber: 0,
			toolCalls: [{ toolCallId: "tc-x", toolName: "search_groups", input: { category: "auto" } }],
			toolResults: [],
		});
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0]).output).toBeNull();
	});

	it("logToolIO emite via console.log (server-side, grepável) — nunca vaza pro cliente", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			logToolIO({
				conversationId: "c",
				stepNumber: 0,
				toolCalls: [{ toolCallId: "t", toolName: "get_group_details", input: { groupId: "z" } }],
				toolResults: [{ toolCallId: "t", toolName: "get_group_details", output: { id: "z" } }],
			});
			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy.mock.calls[0][0]).toMatch(/"source":"tool-io"/);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("FIX-181 — Camada 1 structural: onStepFinish ligado no runner", () => {
	it("runner.ts passa onStepFinish na chamada agent.stream() e chama logToolIO", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(src, "runner precisa ligar onStepFinish no agent.stream()").toMatch(/onStepFinish/);
		expect(src, "runner precisa chamar logToolIO (observabilidade de tool I/O)").toMatch(/logToolIO/);
	});
});
