/**
 * FIX-262 (P1, veredito Fable r5, 2026-07-10) — causa-raiz N1: o LLM chama uma
 * tool FORA do toolset da fase (ex.: `search_groups` em reveal/closing, onde
 * `tool-policy.ts` exclui a descoberta) — o AI SDK v6 emite um chunk
 * `tool-error` (NoSuchToolError). DIFERENTE do `tool-input-error` do FIX-257
 * (falha de validação Zod de uma tool que EXISTE no toolset): aqui a tool nem
 * está disponível. Sem case dedicado, o runner deixava essa chamada cair no
 * mesmo `output: null` mudo — indistinguível de "a tool rodou e não achou
 * nada". Foi esse buraco (não o Zod) que alimentou a espiral de negação: o
 * modelo tratou "tool indisponível" como "não existe" e negou 3× ofertas que
 * estavam na própria tabela exibida ao usuário.
 *
 * Cura: log BARULHENTO e diferenciado (outcome "tool_error") + runner trata o
 * case e nunca deixa a narração crua do modelo (que costuma negar a oferta)
 * chegar ao usuário — mesmo padrão do FIX-186/discoveryFailedThisTurn.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildToolErrorLogLine, logToolError } from "./tool-io-log";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-262 — buildToolErrorLogLine (tool-error nunca é output:null mudo)", () => {
	it("emite outcome=tool_error + error explícito, distinto do tool-input-error do FIX-257", () => {
		const line = buildToolErrorLogLine({
			conversationId: "conv-abc",
			stepNumber: 3,
			error: {
				toolCallId: "tc-1",
				toolName: "search_groups",
				input: { category: "auto" },
				errorText: "Model tried to call unavailable tool 'search_groups'.",
			},
		});
		const rec = JSON.parse(line);
		expect(rec.source).toBe("tool-io");
		expect(rec.level).toBe("error");
		expect(rec.tool).toBe("search_groups");
		expect(rec.conversation_id).toBe("conv-abc");
		expect(rec.outcome).toBe("tool_error");
		expect(rec.outcome).not.toBe("invalid_input");
		expect(rec.error).toMatch(/unavailable tool/i);
		expect(rec.output).toBeNull();
	});

	it("sempre tem uma mensagem de erro, mesmo sem errorText explícito", () => {
		const line = buildToolErrorLogLine({
			stepNumber: 0,
			error: { toolName: "search_groups", input: {} },
		});
		const rec = JSON.parse(line);
		expect(rec.error).toBeTruthy();
		expect(typeof rec.error).toBe("string");
	});

	it("mascara PII no input logado (reusa o masker do FIX-181)", () => {
		const line = buildToolErrorLogLine({
			stepNumber: 0,
			error: { toolName: "capture_lead", input: { phone: "62999996793" }, errorText: "erro" },
		});
		expect(line).not.toContain("62999996793");
	});

	it("logToolError emite via console.error (barulhento)", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			logToolError({
				conversationId: "c",
				stepNumber: 0,
				error: { toolName: "search_groups", errorText: "erro" },
			});
			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy.mock.calls[0][0]).toMatch(/"outcome":"tool_error"/);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("FIX-262 — Camada 1 structural: runner trata tool-error (nunca engole silencioso)", () => {
	it("runner.ts tem case 'tool-error' no fullStream e chama logToolError", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(src, "runner precisa tratar o part.type 'tool-error' do fullStream").toMatch(
			/case "tool-error"/,
		);
		expect(src, "runner precisa logar o tool-error barulhento (não engolir)").toMatch(
			/logToolError/,
		);
	});

	it("runner.ts tem um cap duro de tool-calls por turno (nunca mais 34/593s)", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(src, "runner precisa contar tool-calls do turno e abortar acima de um cap duro").toMatch(
			/TOOL_CALL_HARD_CAP/,
		);
	});
});
