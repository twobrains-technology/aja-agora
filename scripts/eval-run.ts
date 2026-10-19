/**
 * `pnpm eval` — runner do golden-set. É O GATE DE PROMOÇÃO DE PROMPT: nenhuma
 * versão nova da caixa vai para a label de produção sem este runner verde.
 *
 * Fluxo: roda cada cenário de `scripts/eval/golden/*.json` contra o APP REAL
 * (POST /api/chat via SSE — LLM e caixa de verdade), aplica os asserts
 * versionados e imprime o sumário pass/fail por caso.
 *
 * SEM LANGFUSE (desde 19/10/2026): este runner não registra dataset run em
 * serviço nenhum. O resultado vira um arquivo local (`.eval/relatorio-*.json`)
 * com entrada, sha, modelo e o veredito por cenário — que é o que a promoção
 * precisa para ser auditável, sem depender de infra de terceiro.
 *
 * - Asserts: trajetória (artifacts/gates) — NUNCA prosa (CLAUDE.md).
 * - Conversas nascem como SIMULADAS (via /api/admin/simulator/sessions) pra
 *   não poluir o CRM.
 * - Cenários com `requiresEnv` não satisfeito (ex.: E2E_TEST_CPF) são PULADOS
 *   com aviso alto — inconclusivo ≠ verde.
 * - LLM indisponível → exit 3 (indisponibilidade externa nunca vira veredito).
 *
 * Uso:
 *   pnpm eval                      # todos os cenários
 *   pnpm eval -- --only golden-smoke-agente
 */
import "./_env-host";
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { envsFaltando } from "@/lib/eval/env-do-cenario";
import {
	checkScenario,
	type GoldenExpectations,
	type GoldenTurnResult,
} from "@/lib/eval/golden-asserts";

import { DEFAULT_BASE_URL, sendTurn } from "./eval/chat-client.mjs";

const BASE = DEFAULT_BASE_URL as string;
const GOLDEN_DIR = join(import.meta.dirname, "eval", "golden");
const TURN_TIMEOUT_MS = 120_000;

type Turn = { type: string; text?: string; action?: object; label?: string; repeat?: number };

type ItemOutput = {
	skipped?: string;
	conversationId?: string;
	turns?: Array<GoldenTurnResult & { elapsedMs: number }>;
};

function expandEnv(value: string): { text: string; missing: string[] } {
	const missing: string[] = [];
	const text = value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => {
		const v = process.env[name]?.trim();
		if (!v) missing.push(name);
		return v ?? "";
	});
	return { text, missing };
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

type Golden = {
	arquivo: string;
	cenario: string;
	turns: Turn[];
	asserts: GoldenExpectations;
	envFaltando: string[];
};

/** Lê o golden-set do disco — o dataset É o disco (não há serviço no meio). */
function lerGolden(): Golden[] {
	const out: Golden[] = [];
	for (const f of readdirSync(GOLDEN_DIR).filter((n) => n.endsWith(".json"))) {
		const cru = readFileSync(join(GOLDEN_DIR, f), "utf8");
		const d = JSON.parse(cru) as {
			cenario: string;
			turns?: Turn[];
			asserts?: GoldenExpectations;
			requiresEnv?: string[];
		};
		out.push({
			arquivo: f,
			cenario: d.cenario,
			turns: d.turns ?? [],
			asserts: d.asserts ?? {},
			// A exigência de env vem de DUAS fontes: o que o JSON declarou e o que o
			// próprio texto do cenário cita como `${VAR}`. A segunda existe porque a
			// primeira depende de alguém lembrar — e em 2026-08-13 ninguém lembrou:
			// `golden-fecho-nao-anda-pra-tras` manda `"cpf": "${E2E_TEST_CPF}"` sem
			// declarar nada, a env não existia, a expansão virou string VAZIA e o
			// cenário foi reprovado como se o produto estivesse quebrado. FAIL falso
			// custa mais caro que teste ausente.
			envFaltando: envsFaltando({
				cenarioSerializado: cru,
				declaradas: d.requiresEnv ?? [],
				ambiente: process.env,
			}),
		});
	}
	return out;
}

/** Roda UM cenário contra o app real. */
async function rodarCenario(g: Golden): Promise<ItemOutput> {
	const conversationId = await createSimulatedConversation();
	const turns: NonNullable<ItemOutput["turns"]> = [];
	for (const turn of g.turns) {
		const repeat = turn.repeat ?? 1;
		for (let i = 0; i < repeat; i++) {
			const { text: expanded } = expandEnv(JSON.stringify(turn));
			const t = JSON.parse(expanded) as Turn;
			const r = await sendTurn(BASE, conversationId, t, { timeoutMs: TURN_TIMEOUT_MS });
			turns.push({
				userMsg: r.userMsg,
				agentText: r.agentText,
				artifactTypes: r.artifacts.map((a: { type: string }) => a.type),
				// O payload segue junto: os asserts de NÚMERO leem daqui.
				artifacts: r.artifacts as Array<{ type: string; data: unknown }>,
				httpStatus: r.httpStatus,
				error: r.error,
				elapsedMs: r.elapsedMs,
			});
			if (r.error) break;
		}
	}
	return { conversationId, turns };
}

async function main(): Promise<void> {
	const only = process.argv.includes("--only")
		? process.argv[process.argv.indexOf("--only") + 1]
		: null;

	const sha = gitShaCurto();
	const inicio = new Date();
	const runName = `gate-${sha}-${inicio.toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;

	const golden = lerGolden().filter((g) => !only || g.cenario === only);
	if (golden.length === 0) {
		console.log(`⚠️  nenhum cenário${only ? ` com --only ${only}` : ""} em ${GOLDEN_DIR}`);
		process.exit(3);
	}

	const llm = await probeLlm();
	if (!llm.ok) {
		console.error(`\n⚠️  LLM INDISPONÍVEL — eval INCONCLUSIVO (não é veredito!): ${llm.reason}\n`);
		process.exit(3);
	}

	console.log(`\n── pnpm eval · ${golden.length} cenário(s) · run ${runName} ──`);

	let pass = 0;
	let fail = 0;
	let skipEnv = 0;
	const relatorio: Array<{
		cenario: string;
		status: "pass" | "fail" | "skip-env" | "erro";
		turnos: number;
		durMs: number;
		falhas: string[];
		erro?: string;
	}> = [];

	for (const g of golden) {
		if (g.envFaltando.length > 0) {
			skipEnv++;
			console.log(`⏭️  ${g.cenario} — SKIPPED (sem env ${g.envFaltando.join(", ")})`);
			relatorio.push({ cenario: g.cenario, status: "skip-env", turnos: 0, durMs: 0, falhas: [] });
			continue;
		}
		let out: ItemOutput;
		try {
			out = await rodarCenario(g);
		} catch (err) {
			fail++;
			const msg = err instanceof Error ? err.message : String(err);
			console.log(`❌ ${g.cenario} — execução falhou: ${msg}`);
			relatorio.push({
				cenario: g.cenario,
				status: "erro",
				turnos: 0,
				durMs: 0,
				falhas: [],
				erro: msg,
			});
			continue;
		}

		const turns = out.turns ?? [];
		const verdict = checkScenario(turns, g.asserts);
		const durMs = turns.reduce((acc, t) => acc + (t.elapsedMs ?? 0), 0);
		relatorio.push({
			cenario: g.cenario,
			status: verdict.pass ? "pass" : "fail",
			turnos: turns.length,
			durMs,
			falhas: verdict.failures,
		});
		if (verdict.pass) {
			pass++;
			console.log(`✅ ${g.cenario}  ${turns.length} turnos  ${(durMs / 1000).toFixed(1)}s`);
		} else {
			fail++;
			console.log(`❌ ${g.cenario}  ${turns.length} turnos`);
			for (const f of verdict.failures) console.log(`   └─ ${f}`);
		}

		// EVAL_VERBOSE=1 imprime a TRAJETÓRIA de cada turno mesmo quando passa: um
		// cenário que passa por variância do modelo é indistinguível de um que
		// passa de verdade — foi o que travou o diagnóstico de 09/08/2026.
		if (process.env.EVAL_VERBOSE === "1") {
			for (const [i, t] of turns.entries()) {
				console.log(`   ${i + 1}. "${t.userMsg.slice(0, 46)}" → [${t.artifactTypes.join(", ")}]`);
				console.log(`      ${t.agentText.replace(/\s+/g, " ").slice(0, 110)}`);
			}
		}
	}

	console.log("──────────────────────────────────────────────");
	console.log(`${pass} PASS · ${fail} FAIL · ${skipEnv} SKIPPED (env)`);
	if (skipEnv > 0) {
		console.log(
			"⚠️  cenários pulados por env ausente — o gate NÃO cobre a jornada completa até E2E_TEST_CPF/E2E_TEST_CELULAR existirem.",
		);
	}

	// O relatório local é o registro auditável da promoção (antes: dataset run).
	try {
		mkdirSync(".eval", { recursive: true });
		const arquivo = join(".eval", `relatorio-${runName}.json`);
		writeFileSync(
			arquivo,
			JSON.stringify(
				{
					runName,
					sha,
					quando: inicio.toISOString(),
					baseUrl: BASE,
					aiModel: process.env.AI_MODEL ?? null,
					labelDaCaixa: process.env.CAIXA_LABEL ?? "production",
					pass,
					fail,
					skipEnv,
					cenarios: relatorio,
				},
				null,
				2,
			),
		);
		console.log(`Relatório local: ${arquivo}`);
	} catch (err) {
		console.error("[eval] relatório local não gravado (ignorado):", err);
	}

	if (fail > 0) {
		console.log("GATE REPROVADO — não promova a caixa para a label de produção.");
		process.exit(1);
	}
	if (pass === 0) {
		console.log("⚠️  NENHUM cenário rodou — gate INCONCLUSIVO (inconclusivo ≠ verde).");
		process.exit(3);
	}
	console.log("GATE VERDE — promoção da caixa liberada.");
	process.exit(0);
}

main().catch((err) => {
	console.error("✗ eval falhou (infra):", err);
	process.exit(1);
});
