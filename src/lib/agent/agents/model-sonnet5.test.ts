import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ============================================================================
// FIX-209 — Camada 1 (structural): upgrade do agente de runtime + copiloto de
// mesa para Claude Sonnet 5.
//
// Sonnet 5 NÃO é troca de string — tem breaking changes reais vs Sonnet 4.6:
//  (a) `temperature` não-default → 400. O builder passava `temperature:
//      row.temperature` e o copiloto um valor fixo; ambos têm que sair das
//      settings do modelo (o tom por persona passa a ser guiado pelo prompt).
//  (b) adaptive thinking LIGA por default quando o campo `thinking` é omitido
//      → +latência + pausa antes do 1º token, quebrando o <3s do chat. Kairo
//      decidiu OFF explícito: `thinking: { type: "disabled" }` via
//      providerOptions.anthropic (@ai-sdk/anthropic).
//
// Teste estrutural (lê a fonte, sem DB/LLM) — roda no `test:unit` (gate de
// merge da onda). NÃO fica em `builder*.test.ts` de propósito: esse glob é
// EXCLUÍDO do `test:unit`, então a regressão não gate-aria ali.
//
// Escopo = agente de runtime (builder) + copiloto admin (mesa-copilot). Os
// juízes de eval nightly (diagnose/judge/jornada-judge) continuam em Sonnet 4.6
// de propósito (trocar o juiz quebra baseline) — não são asseridos aqui.
// ============================================================================

const builderSrc = readFileSync("src/lib/agent/agents/builder.ts", "utf-8");
const mesaSrc = readFileSync("src/lib/agent/mesa-copilot/index.ts", "utf-8");

describe("FIX-209 — agente de runtime (builder) migra pra Claude Sonnet 5", () => {
	it("o modelo default é claude-sonnet-5 (mantém override por AI_MODEL)", () => {
		expect(builderSrc).toMatch(/process\.env\.AI_MODEL\s*\?\?\s*"claude-sonnet-5"/);
		expect(builderSrc).not.toContain("claude-sonnet-4-6");
	});

	it("NÃO passa `temperature` pro modelo (Sonnet 5 rejeita não-default → 400)", () => {
		// O único param de sampling do builder era `temperature: row.temperature`
		// (Claude só expõe temperature). Sonnet 5 dá 400 em temperature não-default
		// → tem que sair das settings do ToolLoopAgent.
		expect(builderSrc).not.toMatch(/temperature:\s*row\.temperature/);
	});

	it("desliga thinking explicitamente (adaptive liga por default no Sonnet 5)", () => {
		expect(builderSrc).toMatch(/thinking:\s*\{\s*type:\s*"disabled"/);
	});
});

describe("FIX-209 — copiloto de mesa (mesa-copilot) migra pra Claude Sonnet 5", () => {
	it("o modelo default é claude-sonnet-5 (mantém override por AI_MODEL)", () => {
		expect(mesaSrc).toMatch(/process\.env\.AI_MODEL\s*\?\?\s*"claude-sonnet-5"/);
		expect(mesaSrc).not.toContain("claude-sonnet-4-6");
	});

	it("NÃO passa `temperature` numérico pro modelo (Sonnet 5 rejeita → 400)", () => {
		// O copiloto passava um temperature fixo (precisão > criatividade). Sonnet 5
		// rejeita → sai; a precisão passa a ser guiada pelo system prompt/persona.
		expect(mesaSrc).not.toMatch(/temperature:\s*[0-9]/);
	});

	it("desliga thinking explicitamente", () => {
		expect(mesaSrc).toMatch(/thinking:\s*\{\s*type:\s*"disabled"/);
	});
});
