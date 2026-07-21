// Flag de runtime de IA — chaveia `runTurn()` (orchestrator/index.ts) entre o
// runtime Vercel AI SDK (atual, default) e o runtime LangGraph (novo,
// campanha `.processo/loop/2026-07-20-1948-langgraph-runtime.md`). Espelha o
// padrão de `utils/env.ts` (isSimulatorEnabled): lê `process.env` direto,
// trata string vazia como ausente, default permissivo (vercel).
export type RuntimeFlavor = "vercel" | "langgraph";

export function runtimeFlavor(): RuntimeFlavor {
	const raw = process.env.AI_RUNTIME?.trim().toLowerCase();
	return raw === "langgraph" ? "langgraph" : "vercel";
}
