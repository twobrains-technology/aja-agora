import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================================
// FIX-77 — Camada 1 (structural): orchestrator NÃO mete role:"system" em
// `messages`; os system dinâmicos chegam via `instructions`/`system`.
// ----------------------------------------------------------------------------
// Bug real (Kairo 2026-06-25): a cada turno do agente principal saía no stdout
//   "AI SDK Warning: System messages in the prompt or messages fields can be a
//    security risk because they may enable prompt injection attacks..."
// Origem: o orchestrator prependava mensagens role:"system" DENTRO do array
// `messages` de agent.stream(...) (examplesBlock no runner, systemContext +
// memoryPrefix + knownName no index). Achado colateral: a memória Letta era
// injetada EM DOBRO (campo `system` via builder E `messages` via index).
//
// Correção (Opção A): threadar systemContext + examplesBlock pro builder
// (instructions, SEM cacheControl, depois de stable/dynamic/memory) e parar de
// prepender em `messages`. A memória entra só via builder → duplicação morre.
// ============================================================================

function src(rel: string): string {
	return readFileSync(resolve(process.cwd(), rel), "utf-8");
}

const runnerSrc = src("src/lib/agent/orchestrator/runner.ts");
const indexSrc = src("src/lib/agent/orchestrator/index.ts");
const builderSrc = src("src/lib/agent/agents/builder.ts");
const resolveSrc = src("src/lib/agent/agents/index.ts");

describe("FIX-77 — nenhum role:'system' vai pra `messages` do agent.stream", () => {
	it("runner.ts NÃO prependa examplesBlock como system message em `messages`", () => {
		// O bug: `messagesWithExamples = examplesBlock ? [{role:"system", content:
		// examplesBlock}, ...messages] : messages`. Pós-fix o examplesBlock vai pro
		// builder via extraSystemBlocks — não pode mais virar item de `messages`.
		expect(
			runnerSrc.includes('content: examplesBlock }, ...messages'),
			"runner.ts não pode mais prepender examplesBlock como system em messages.",
		).toBe(false);
		expect(
			runnerSrc.includes("messagesWithExamples"),
			"`messagesWithExamples` foi eliminado — examplesBlock agora vai via builder.",
		).toBe(false);
	});

	it("runner.ts thread examplesBlock + systemContext pro builder via extraSystemBlocks", () => {
		expect(runnerSrc).toMatch(/extraSystemBlocks/);
		// agent.stream recebe `messages` cru (sem prepend de system). FIX-181 (2026-07-01)
		// adicionou `onStepFinish` como chave IRMÃ (observabilidade de tool I/O) — `messages`
		// segue sendo o 1º campo, cru, sem wrap/prepend; o regex tolera a vírgula/irmã.
		expect(runnerSrc).toMatch(/agent\.stream\(\{\s*messages\s*[},]/);
	});

	it("index.ts NÃO inclui systemContext nem memoryPrefix no array de `messages`", () => {
		// Pós-fix `messagesForAgent` não pode espalhar systemContext nem memoryPrefix.
		const block =
			indexSrc.match(/const messagesForAgent[\s\S]*?;\n/)?.[0] ?? indexSrc;
		expect(block.includes("...systemContext")).toBe(false);
		expect(block.includes("...memoryPrefix")).toBe(false);
	});

	it("index.ts passa os system dinâmicos pro runner via systemContextBlocks (não em messages)", () => {
		expect(indexSrc).toMatch(/systemContextBlocks/);
	});

	it("DUPLICAÇÃO LETTA: a memória NÃO é mais prependada em messages (só via builder/memoryContext)", () => {
		// memoryPrefix não pode mais ser spread em messagesForAgent. A memória chega
		// ao prompt uma única vez, via memoryContext → buildAgent → memoryText.
		const block = indexSrc.match(/const messagesForAgent[\s\S]*?;\n/)?.[0] ?? "";
		expect(block.includes("memoryPrefix")).toBe(false);
		expect(runnerSrc.includes("memoryContext")).toBe(true);
	});
});

describe("FIX-77 — builder anexa extraSystemBlocks ao instructions SEM quebrar o cache", () => {
	it("builder aceita extraSystemBlocks e os anexa ao instructions", () => {
		expect(builderSrc).toMatch(/extraSystemBlocks/);
	});

	it("os extraSystemBlocks entram SEM cacheControl/providerOptions (prefixo cacheado intacto)", () => {
		// A definição dos blocos dinâmicos NÃO pode carregar cacheControl — senão o
		// prefixo cacheado (stable) quebraria a cada turno.
		const extraDef = builderSrc.match(/const extraBlocks =[\s\S]*?;\n/)?.[0] ?? "";
		expect(extraDef.length, "bloco `const extraBlocks = ...` não encontrado").toBeGreaterThan(0);
		expect(extraDef.includes("cacheControl")).toBe(false);
		expect(extraDef.includes("providerOptions")).toBe(false);
		// E o cacheControl em CÓDIGO (providerOptions) só aparece colado a blocks.stable.
		for (const m of builderSrc.matchAll(/providerOptions:\s*\{/g)) {
			const around = builderSrc.slice(Math.max(0, (m.index ?? 0) - 200), m.index);
			expect(
				around.includes("blocks.stable"),
				"todo providerOptions/cacheControl do builder tem que estar no bloco stable.",
			).toBe(true);
		}
	});

	it("o stable continua sendo o 1º item com cacheControl ephemeral (prefixo cacheado intacto)", () => {
		expect(builderSrc).toMatch(/content:\s*blocks\.stable[\s\S]{0,160}cacheControl/);
		expect(builderSrc).toMatch(/anthropic:\s*\{\s*cacheControl:\s*\{\s*type:\s*"ephemeral"/);
	});

	it("resolveAgent inclui extraSystemBlocks na cache key (não vaza systemContext entre conversas)", () => {
		// Paths cacheados (concierge) precisam diferenciar a instância por
		// extraSystemBlocks — senão o knownName de uma conversa vazaria pra outra.
		expect(resolveSrc).toMatch(/extraSystemBlocks/);
		expect(resolveSrc).toMatch(/ex-\$\{?extra/i);
	});
});
