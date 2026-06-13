import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// GARANTIA de prompt caching (Kairo 2026-06-11): "conferir e garantir que
// estamos usando cache da Anthropic para economizar tokens em toda a plataforma".
//
// O caminho de MAIOR custo (agente principal — Sonnet, prompt grande, loop
// multi-step de tool calling, roda em web E WhatsApp via runner→builder) DEVE
// cachear o prefixo estável do system prompt + tools. Cache write/read da Anthropic
// só economiza se o bloco cacheado for byte-idêntico entre turnos dentro do TTL
// (5 min). Estes asserts estruturais travam a config pra não regredir.

const builderSrc = readFileSync("src/lib/agent/agents/builder.ts", "utf-8");
const promptSrc = readFileSync("src/lib/agent/system-prompt.ts", "utf-8");

describe("prompt-cache — agente principal cacheia o prefixo estável (anti-regressão)", () => {
	it("builder.ts aplica cacheControl ephemeral no bloco STABLE do system prompt", () => {
		// providerOptions.anthropic.cacheControl.type === "ephemeral" no system block.
		expect(builderSrc).toMatch(/providerOptions/);
		expect(builderSrc).toMatch(/anthropic:\s*\{\s*cacheControl:\s*\{\s*type:\s*"ephemeral"/);
	});

	it("o cacheControl fica no bloco content: blocks.stable (não no dinâmico)", () => {
		// O bloco com cacheControl deve ser o blocks.stable — o dinâmico é volátil
		// e NÃO pode ser cacheado (quebraria o cache a cada turno).
		expect(builderSrc).toMatch(/content:\s*blocks\.stable[\s\S]{0,160}cacheControl/);
		// E o bloco dinâmico segue SEM cacheControl logo após.
		expect(builderSrc).toMatch(/role:\s*"system"[^}]*content:\s*blocks\.dynamic\s*\}/);
	});

	it("a data no bloco stable é day-precision (slice 0,10) — não invalida o cache por request", () => {
		// Se a data fosse timestamp (com hora/min), o bloco stable mudaria a cada
		// request e o cache nunca daria hit. Tem que ser YYYY-MM-DD.
		expect(promptSrc).toMatch(/currentDateISO\s*=\s*now\.toISOString\(\)\.slice\(0,\s*10\)/);
		// E a data vive no bloco stable (cacheável), não fora dele.
		expect(promptSrc).toMatch(/const stable = `[\s\S]*current_date[\s\S]*`/);
	});
});
