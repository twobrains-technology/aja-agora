/**
 * `pnpm eval` — experiment runner do golden-set. É O GATE DE PROMOÇÃO DE
 * PROMPT: nenhuma versão nova ganha a label `production` no Langfuse sem este
 * runner verde (ver README → "Ciclo de avaliação").
 *
 * Fluxo: roda cada cenário do dataset `golden-set` contra o APP REAL
 * (POST /api/chat via SSE — LLM e prompt de verdade), registra o resultado
 * como dataset run no Langfuse (1 trace por cenário, sessionId = conversa) e
 * imprime o sumário pass/fail por caso.
 *
 * - Asserts: trajetória (artifacts/gates) — NUNCA prosa (CLAUDE.md).
 * - Conversas nascem como SIMULADAS (via /api/admin/simulator/sessions) pra
 *   não poluir o CRM.
 * - Cenários com `requiresEnv` não satisfeito (ex.: E2E_TEST_CPF) são PULADOS
 *   com aviso alto — inconclusivo ≠ verde.
 * - LLM indisponível → exit 3 (política herdada de anthropic-availability:
 *   indisponibilidade externa nunca vira veredito).
 *
 * Uso:
 *   pnpm eval                      # todos os cenários
 *   pnpm eval -- --only golden-smoke-agente
 */
import "./_env-host";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	checkScenario,
	type GoldenExpectations,
	type GoldenTurnResult,
} from "@/lib/eval/golden-asserts";
import { getLangfuseClient } from "@/lib/observability/langfuse/client";
import { flushLangfuse, initLangfuseTracing } from "@/lib/observability/langfuse/setup";

import { DEFAULT_BASE_URL, sendTurn } from "./eval/chat-client.mjs";

const BASE = DEFAULT_BASE_URL as string;
const DATASET = "golden-set";
const TURN_TIMEOUT_MS = 120_000;

type Turn = { type: string; text?: string; action?: object; label?: string; repeat?: number };

function expandEnv(value: string): { text: string; missing: string[] } {
	const missing: string[] = [];
	const text = value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => {
		const v = process.env[name]?.trim();
		if (!v) missing.push(name);
		return v ?? "";
	});
	return { text, missing };
}

function unmetEnv(requires: string[]): string[] {
	return requires.filter((name) => !process.env[name]?.trim());
}

async function probeLlm(): Promise<{ ok: boolean; reason?: string }> {
	// O caminho real do app é o gateway LiteLLM; sonda 1 token por ele.
	const base = process.env.LITELLM_BASE_URL?.trim();
	const key = process.env.LITELLM_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
	if (!base || !key) return { ok: false, reason: "LITELLM_BASE_URL/API key ausentes no ambiente" };
	try {
		const res = await fetch(`${base}/v1/messages`, {
			method: "POST",
			headers: {
				"x-api-key": key,
				"anthropic-version": "2023-06-01",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: process.env.AI_MODEL?.trim() || "claude-haiku-4-5",
				max_tokens: 1,
				messages: [{ role: "user", content: "ping" }],
			}),
			signal: AbortSignal.timeout(15_000),
		});
		if (res.ok) return { ok: true };
		return { ok: false, reason: `gateway HTTP ${res.status}: ${(await res.text()).slice(0, 160)}` };
	} catch (err) {
		return { ok: false, reason: `gateway inalcançável: ${err}` };
	}
}

/** Login admin + criação de sessão de simulador (conversa is_simulated). */
async function createSimulatedConversation(): Promise<string> {
	const email = process.env.ADMIN_EMAIL;
	const password = process.env.ADMIN_PASSWORD;
	if (!email || !password) throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD ausentes no ambiente");
	// `Origin` explícito: fetch server-side não manda Origin e o Better Auth
	// recusa POST sem origem confiável (403) — descoberto no smoke do runner.
	const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: BASE },
		body: JSON.stringify({ email, password }),
	});
	if (!login.ok) throw new Error(`login admin falhou: HTTP ${login.status}`);
	const cookie = login.headers.getSetCookie?.().join("; ") ?? login.headers.get("set-cookie") ?? "";
	const res = await fetch(`${BASE}/api/admin/simulator/sessions`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE },
		body: JSON.stringify({ channel: "web" }),
	});
	if (!res.ok) throw new Error(`criação de sessão de simulador falhou: HTTP ${res.status}`);
	const data = (await res.json()) as { conversationId: string };
	return data.conversationId;
}

function gitShaCurto(): string {
	try {
		return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
	} catch {
		// Container não tem o binário git — lê o .git do bind mount na unha.
		try {
			const head = readFileSync(".git/HEAD", "utf8").trim();
			const sha = head.startsWith("ref: ")
				? readFileSync(`.git/${head.slice(5)}`, "utf8").trim()
				: head;
			return sha.slice(0, 8);
		} catch {
			return "sem-git";
		}
	}
}

type ItemOutput = {
	skipped?: string;
	conversationId?: string;
	turns?: Array<GoldenTurnResult & { elapsedMs: number; langfuseTraceId: string | null }>;
};

async function main(): Promise<void> {
	const only = process.argv.includes("--only")
		? process.argv[process.argv.indexOf("--only") + 1]
		: null;

	initLangfuseTracing();
	const client = getLangfuseClient();
	if (!client) {
		console.error("✗ LANGFUSE_* ausentes — o runner registra dataset runs, precisa das chaves.");
		process.exit(1);
	}

	const llm = await probeLlm();
	if (!llm.ok) {
		console.error(`\n⚠️  LLM INDISPONÍVEL — eval INCONCLUSIVO (não é veredito!): ${llm.reason}\n`);
		process.exit(3);
	}

	const dataset = await client.dataset.get(DATASET);
	const runName = `gate-${gitShaCurto()}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

	const resultado = await dataset.runExperiment({
		name: runName,
		description: "Gate de promoção de prompt — golden-set contra o app real",
		metadata: { baseUrl: BASE, aiModel: process.env.AI_MODEL ?? null },
		maxConcurrency: 2,
		task: async (item): Promise<ItemOutput> => {
			const input = item.input as { cenario: string; turns: Turn[] };
			const meta = (item.metadata ?? {}) as { requiresEnv?: string[] };
			if (only && input.cenario !== only) return { skipped: "fora do filtro --only" };
			const faltando = unmetEnv(meta.requiresEnv ?? []);
			if (faltando.length > 0) return { skipped: `sem env ${faltando.join(", ")}` };

			const conversationId = await createSimulatedConversation();
			const turns: ItemOutput["turns"] = [];
			for (const turn of input.turns) {
				const repeat = turn.repeat ?? 1;
				for (let i = 0; i < repeat; i++) {
					const raw = JSON.stringify(turn);
					const { text: expanded } = expandEnv(raw);
					const t = JSON.parse(expanded) as Turn;
					const r = await sendTurn(BASE, conversationId, t, { timeoutMs: TURN_TIMEOUT_MS });
					turns.push({
						userMsg: r.userMsg,
						agentText: r.agentText,
						artifactTypes: r.artifacts.map((a: { type: string }) => a.type),
						httpStatus: r.httpStatus,
						error: r.error,
						elapsedMs: r.elapsedMs,
						langfuseTraceId: r.langfuseTraceId,
					});
					if (r.error) break;
				}
			}
			return { conversationId, turns };
		},
		evaluators: [
			async ({ output, expectedOutput }) => {
				const out = output as ItemOutput;
				if (out.skipped)
					return { name: "trajectory_pass", value: 1, comment: `SKIPPED: ${out.skipped}` };
				const verdict = checkScenario(out.turns ?? [], expectedOutput ?? {});
				return {
					name: "trajectory_pass",
					value: verdict.pass ? 1 : 0,
					comment: verdict.failures.join(" | ").slice(0, 900) || "trajetória ok",
				};
			},
		],
	});

	// Sumário no terminal — o veredito local usa os MESMOS asserts versionados
	// em scripts/eval/golden/ (o run no Langfuse guarda o mesmo resultado via
	// evaluator; aqui é a fonte do exit code do gate).
	const goldenLocal = new Map<string, { asserts: GoldenExpectations; requiresEnv: string[] }>();
	const goldenDir = join(import.meta.dirname, "eval", "golden");
	for (const f of readdirSync(goldenDir).filter((f) => f.endsWith(".json"))) {
		const d = JSON.parse(readFileSync(join(goldenDir, f), "utf8")) as {
			cenario: string;
			asserts?: GoldenExpectations;
			requiresEnv?: string[];
		};
		goldenLocal.set(d.cenario, { asserts: d.asserts ?? {}, requiresEnv: d.requiresEnv ?? [] });
	}
	// O que DEVERIA ter rodado: passa no filtro --only e tem env satisfeita.
	// Cenário esperado que não aparece no resultado = task lançou (o SDK pula
	// itens com erro) — conta como FALHA DE INFRA, nunca como verde.
	const esperados = new Set(
		[...goldenLocal.entries()]
			.filter(([nome, g]) => (!only || nome === only) && unmetEnv(g.requiresEnv).length === 0)
			.map(([nome]) => nome),
	);

	console.log(`\n── pnpm eval · dataset ${DATASET} · run ${runName} ──`);
	let pass = 0;
	let fail = 0;
	let skipEnv = 0;
	type ItemResult = { item?: { id?: string; input?: unknown }; output?: ItemOutput };
	const itens = (resultado as { itemResults?: ItemResult[] }).itemResults ?? [];
	const vistos = new Set<string>();
	for (const r of itens) {
		const input = (r.item?.input ?? {}) as { cenario?: string };
		const cenario = input.cenario ?? r.item?.id ?? "?";
		vistos.add(cenario);
		const out = (r.output ?? {}) as ItemOutput;
		if (out.skipped) {
			if (out.skipped.startsWith("sem env")) {
				skipEnv++;
				console.log(`⏭️  ${cenario} — SKIPPED (${out.skipped})`);
			}
			// skip de filtro --only: silencioso (não é informação).
			continue;
		}
		const turns = out.turns ?? [];
		const verdict = checkScenario(turns, goldenLocal.get(cenario)?.asserts ?? {});
		const durMs = turns.reduce((acc, t) => acc + (t.elapsedMs ?? 0), 0);
		if (verdict.pass) {
			pass++;
			console.log(`✅ ${cenario}  ${turns.length} turnos  ${(durMs / 1000).toFixed(1)}s`);
		} else {
			fail++;
			console.log(`❌ ${cenario}  ${turns.length} turnos`);
			for (const f of verdict.failures) console.log(`   └─ ${f}`);
		}
	}
	for (const cenario of esperados) {
		if (!vistos.has(cenario)) {
			fail++;
			console.log(`❌ ${cenario} — task falhou antes de completar (ver erro do SDK acima)`);
		}
	}
	console.log("──────────────────────────────────────────────");
	console.log(`${pass} PASS · ${fail} FAIL · ${skipEnv} SKIPPED (env)`);
	if (skipEnv > 0) {
		console.log(
			"⚠️  cenários pulados por env ausente — o gate NÃO cobre a jornada completa até E2E_TEST_CPF/E2E_TEST_CELULAR existirem.",
		);
	}
	console.log(
		`Run no Langfuse: ${process.env.LANGFUSE_BASE_URL} → Datasets → ${DATASET} → ${runName}`,
	);
	await flushLangfuse();
	if (fail > 0) {
		console.log("GATE REPROVADO — não promova o prompt pra label `production`.");
		process.exit(1);
	}
	if (pass === 0) {
		console.log("⚠️  NENHUM cenário rodou — gate INCONCLUSIVO (inconclusivo ≠ verde).");
		process.exit(3);
	}
	console.log("GATE VERDE — promoção de prompt liberada.");
	process.exit(0);
}

main().catch(async (err) => {
	console.error("✗ eval falhou (infra):", err);
	await flushLangfuse();
	process.exit(1);
});
