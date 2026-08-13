// FIX-431 — nenhum directive pode mandar chamar tool que o modelo não tem.
//
// Produção, WhatsApp, 2026-08-13. Sessão `a68b1945` (BYD Song, R$ 238 mil): o
// modelo chamou `search_groups`, recebeu `Error: Tool "search_groups" not
// found. Please fix your mistakes.` e traduziu isso ao cliente como
// "Infelizmente tive um problema na busca" → "problema técnico, mas já está
// resolvido" → "deixa eu chamar o nosso time de suporte" → handoff. Venda
// perdida. Sessão `04fda013`, minutos depois: o directive do servidor mandava
// literalmente "FLUXO OBRIGATÓRIO ... 1. Chame search_groups", e a mesma tool
// fantasma queimou três rodadas de LLM — 13 segundos DEPOIS de o nó `discovery`
// já ter feito a busca no mesmo turno.
//
// A tool não sumiu por fase: ela **nunca** esteve no toolset do grafo. A
// descoberta é determinística (nó `discovery`), e `WHAT_IF_TOOL_NAMES`
// (langgraph/toolset.ts) diz isso desde sempre. Quem não sabia era o texto do
// directive — herdado do runtime Vercel anterior, onde `tool-policy.ts` mandava.
//
// ⚠️ A ancoragem deste teste é `WHAT_IF_TOOL_NAMES`, e não `allowedTools`. Foi
// o erro que eu mesmo cometi na primeira versão: `allowedTools` responde pelo
// runtime antigo, então casava com o directive e ficava verde medindo a fonte
// errada — teste circular, o anti-padrão que o CLAUDE.md nomeia.
import { describe, expect, it } from "vitest";
import { WHAT_IF_TOOL_NAMES } from "@/lib/agent/langgraph/toolset";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { buildSearchSummaryDirective } from "./directives";

const NO_TOOLSET: ReadonlySet<string> = new Set(WHAT_IF_TOOL_NAMES);

/** Todo nome de tool que o directive ORDENA chamar. O underscore separa nome de
 *  tool de palavra em português ("chame ferramenta nenhuma"): toda tool do
 *  registry é snake_case. */
export function toolsOrdenadas(directive: string): string[] {
	const nomes = new Set<string>();
	for (const m of directive.matchAll(/cham(?:e|ando|ar)\s+(?:a\s+)?([a-z]+_[a-z_]+)/gi)) {
		nomes.add(m[1]);
	}
	return [...nomes];
}

const BASE = {
	currentPersona: "moto",
	currentCategory: "moto",
	desireAsked: true,
	desireAnswered: true,
	motivationAsked: true,
	identityCollected: true,
	qualifyAnswers: { creditMin: 19_800, creditMax: 22_000 },
} as ConversationMetadata;

describe("directive da busca × toolset REAL do grafo", () => {
	it("não ordena nenhuma tool que o modelo não tem", () => {
		const directive = buildSearchSummaryDirective({ category: "moto", meta: BASE });
		const fantasmas = toolsOrdenadas(directive).filter((t) => !NO_TOOLSET.has(t));
		expect(
			fantasmas,
			`o directive manda chamar tool que não existe no toolset do grafo: ${fantasmas.join(", ")}`,
		).toEqual([]);
	});

	// A correção não pode virar mordaça: o turno do reveal continua tendo que
	// apresentar a simulação, e `simulate_quota`/`present_simulation_result`
	// existem de verdade.
	it("continua instruindo o que o modelo PODE fazer", () => {
		const directive = buildSearchSummaryDirective({ category: "moto", meta: BASE });
		expect(directive).toMatch(/present_simulation_result|simulate_quota/);
	});

	// O que garante que este teste não apodrece: se alguém trocar o toolset, é
	// aqui que a divergência aparece — não em produção, na fala do agente.
	it("a busca segue fora do toolset (é do nó discovery, não do LLM)", () => {
		expect(NO_TOOLSET.has("search_groups")).toBe(false);
		expect(NO_TOOLSET.has("recommend_groups")).toBe(false);
	});
});
