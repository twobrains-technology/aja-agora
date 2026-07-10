/**
 * FIX-257 (P1, veredito Fable r4 §P1 #1, 2026-07-10) — "erro de tool NÃO pode
 * ser silencioso" (Lei 1/4). Hoje, quando o input de uma tool-call falha a
 * validação Zod (ex.: creditMin como string não-coagível), o AI SDK v6 emite
 * um chunk `tool-input-error` no `fullStream` — mas o loop do runner só trata
 * "text-delta"/"tool-result"/"tool-call" (ver `runner.ts`), então esse chunk
 * é engolido: nenhum log, nenhum sinal. O ÚNICO rastro que sobra é
 * `tool-io-log` via `onStepFinish`, que registra a chamada SEM resultado
 * pareado como `output: null` (ver `buildToolIoLogLines`) — indistinguível de
 * "a tool rodou e não achou nada". Foi essa indistinguibilidade que alimentou
 * a espiral de negação (o agente tratou "sem confirmação" como "não existe").
 *
 * Cura (2ª linha, depois da coerção em schemas.ts/ai-sdk.ts): um log BARULHENTO
 * e DIFERENCIADO (console.error, nível "error", `outcome: "invalid_input"`,
 * mensagem de erro explícita) pro caso de erro de input de tool — nunca mais
 * um `output: null` mudo. `runner.ts` precisa ligar isso no `case
 * "tool-input-error"` do fullStream (Camada 1 structural, mesmo padrão do
 * FIX-181/FIX-182 neste arquivo/pasta).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildToolInputErrorLogLine, logToolInputError } from "./tool-io-log";

function readSource(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

describe("FIX-257 — buildToolInputErrorLogLine (erro de input de tool nunca é null mudo)", () => {
	it("emite outcome=invalid_input + error explícito (nunca output:null indistinguível)", () => {
		const line = buildToolInputErrorLogLine({
			conversationId: "conv-abc",
			stepNumber: 1,
			error: {
				toolCallId: "tc-1",
				toolName: "search_groups",
				input: { category: "auto", creditMax: "muito" },
				errorText: "Invalid input: expected number, received string",
			},
		});
		const rec = JSON.parse(line);
		expect(rec.source).toBe("tool-io");
		expect(rec.level).toBe("error");
		expect(rec.tool).toBe("search_groups");
		expect(rec.conversation_id).toBe("conv-abc");
		expect(rec.outcome).toBe("invalid_input");
		expect(rec.error).toBeTruthy();
		expect(rec.error).toMatch(/expected number/i);
		// distinção explícita do "output:null" silencioso do FIX-181 (chamada sem
		// resultado pareado) — aqui existe uma RAZÃO nomeada, não um vazio mudo.
		expect(rec.output).toBeNull();
	});

	it("sempre tem uma mensagem de erro, mesmo sem errorText explícito", () => {
		const line = buildToolInputErrorLogLine({
			stepNumber: 0,
			error: { toolName: "simulate_quota", input: {} },
		});
		const rec = JSON.parse(line);
		expect(rec.error).toBeTruthy();
		expect(typeof rec.error).toBe("string");
	});

	it("mascara PII no input logado (reusa o masker do FIX-181)", () => {
		const line = buildToolInputErrorLogLine({
			stepNumber: 0,
			error: { toolName: "capture_lead", input: { phone: "62999996793" }, errorText: "erro" },
		});
		expect(line).not.toContain("62999996793");
	});

	it("logToolInputError emite via console.error (barulhento — nível de severidade diferente do console.log do FIX-181)", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			logToolInputError({
				conversationId: "c",
				stepNumber: 0,
				error: { toolName: "search_groups", input: { creditMax: "muito" }, errorText: "erro" },
			});
			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy.mock.calls[0][0]).toMatch(/"outcome":"invalid_input"/);
		} finally {
			spy.mockRestore();
		}
	});
});

describe("FIX-257 — Camada 1 structural: runner trata tool-input-error (nunca engole silencioso)", () => {
	it("runner.ts tem case 'tool-input-error' no fullStream e chama logToolInputError", () => {
		const src = readSource("src/lib/agent/orchestrator/runner.ts");
		expect(src, "runner precisa tratar o part.type 'tool-input-error' do fullStream").toMatch(
			/tool-input-error/,
		);
		expect(src, "runner precisa logar o erro de input barulhento (não engolir)").toMatch(
			/logToolInputError/,
		);
	});
});
