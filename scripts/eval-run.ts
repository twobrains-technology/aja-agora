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
 * Com `--dataset-run` (B10), ADEMIS grava o run na instância Langfuse via
 * `scripts/eval/langfuse-dataset-run.ts` — fire-and-forget: falha de
 * observabilidade nunca muda o veredito nem o exit code do gate.
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
 *   pnpm eval -- --dataset-run     # grava o run no Langfuse (B10)
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
import type { PersonaContext } from "@/lib/eval/rubric";
import type { DeterministicSignals } from "@/lib/eval/signals";

import { DEFAULT_BASE_URL, sendTurn } from "./eval/chat-client.mjs";
import { DatasetRunRecorder, type ItemDoRun, type ScoreDoItem } from "./eval/langfuse-dataset-run";
import {
	criarSessaoSimulada,
	enviarTurnoComRetry,
	escolherSonda,
	loginAdmin,
	motivoDaSondaPeloApp,
	type Sonda,
} from "./eval-run-sonda";
import { type FingerprintDaCaixa, nomeDoRunDeConduta, shaDoCodigo } from "./eval-sha";

const BASE = DEFAULT_BASE_URL as string;
const GOLDEN_DIR = join(import.meta.dirname, "eval", "golden");
const TURN_TIMEOUT_MS = 120_000;

type Turn = { type: string; text?: string; action?: object; label?: string; repeat?: number };

type ItemOutput = {
	skipped?: string;
	conversationId?: string;
	/** Esgotou o reenvio em 429: transporte, não conduta. */
	inconclusivo?: boolean;
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

/** Sonda pelo próprio app (alvo remoto): um turno "oi" pelo mesmo caminho dos cenários. */
async function probeLlmPeloApp(): Promise<{ ok: boolean; reason?: string }> {
	try {
		const cid = await createSimulatedConversation();
		const r = await sendTurn(BASE, cid, { text: "oi" }, { timeoutMs: TURN_TIMEOUT_MS });
		const motivo = motivoDaSondaPeloApp(r);
		return motivo ? { ok: false, reason: motivo } : { ok: true };
	} catch (err) {
		return { ok: false, reason: `sonda pelo app falhou: ${err}` };
	}
}

let cookieAdmin: string | null = null;

/** Login admin UMA vez por rodada (o Better Auth da dev limita o sign-in) + sessão de simulador (conversa is_simulated). */
async function createSimulatedConversation(): Promise<string> {
	if (cookieAdmin === null) {
		const email = process.env.ADMIN_EMAIL;
		const password = process.env.ADMIN_PASSWORD;
		if (!email || !password) throw new Error("ADMIN_EMAIL/ADMIN_PASSWORD ausentes no ambiente");
		cookieAdmin = await loginAdmin(BASE, email, password);
	}
	return criarSessaoSimulada(BASE, cookieAdmin);
}

function gitShaCurto(): string {
	// Dentro do container (onde a bateria roda: o login admin só aceita a origem do app)
	// não há binário git nem o gitdir da worktree, que aponta para um caminho do host.
	// Quem lança passa o sha medido no host — sem isso o relatório sai "sem-git" e o
	// placar fica sem o carimbo do código que rodou.
	const doAmbiente = process.env.EVAL_GIT_SHA?.trim();
	if (doAmbiente) return doAmbiente.slice(0, 8);
	try {
		return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
	} catch {
		// Container não tem o binário git — lê o .git na unha (`scripts/eval-sha.ts`),
		// com o layout de WORKTREE incluído: aqui `.git` é arquivo, não diretório.
		return shaDoCodigo(process.cwd());
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
	const out: ItemOutput = { conversationId, turns };
	for (const turn of g.turns) {
		const repeat = turn.repeat ?? 1;
		for (let i = 0; i < repeat; i++) {
			const { text: expanded } = expandEnv(JSON.stringify(turn));
			const t = JSON.parse(expanded) as Turn;
			const { r, inconclusivo } = await enviarTurnoComRetry(() =>
				sendTurn(BASE, conversationId, t, { timeoutMs: TURN_TIMEOUT_MS }),
			);
			if (inconclusivo) out.inconclusivo = true;
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
		if (out.inconclusivo) break;
	}
	return out;
}

// ── B10 — scores do item para o dataset run ─────────────────────────────

const PERSONA_PADRAO: PersonaContext = {
	personaId: "vendedor-aja-agora",
	displayName: "Vendedor Aja Agora",
	category: "auto",
	expertise: "consorcio",
};

/** `bevi_proposals` da conversa simulada — o fato que B5 cruza com a fala.
 *  Falha de banco aqui não quebra o eval: devolve 0 com aviso (sub-estima;
 *  o comentário do score avisa). */
async function contarPropostas(conversationId: string): Promise<number> {
	try {
		const { db } = await import("@/db");
		const { beviProposals } = await import("@/db/schema");
		const { sql } = await import("drizzle-orm");
		const [linha] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(beviProposals)
			.where(sql`${beviProposals.conversationId} = ${conversationId}`);
		return Number(linha?.total ?? 0);
	} catch (e) {
		console.error(
			`[dataset-run] contagem de propostas falhou (score B5 pode sub-estimar): ${e instanceof Error ? e.message : e}`,
		);
		return 0;
	}
}

function sinaisDeItem(args: {
	turns: ItemDoRun["turns"];
	propostas: number;
	falaPrometida: boolean;
	numeroFora: string[];
}): DeterministicSignals {
	return {
		replyRate: 1,
		qualifyCoverage: 0,
		qualifyMissing: [],
		numbersInTextFlagged: args.numeroFora.map((n, i) => ({
			messageId: `turn-${i}`,
			number: n,
			context: "turno do eval",
		})),
		dropOffGate: null,
		conversionStage: "novo",
		hasLead: false,
		personaSegments: [],
		propostas: args.propostas,
		contratoFechado: false,
		repeticoesDoAgente: 0,
		alertas: args.falaPrometida && args.propostas === 0 ? ["promessa_sem_fato"] : [],
	};
}

async function scoresDoItem(args: {
	item: ItemDoRun;
	falhasDeTrajetoria: string[];
}): Promise<ScoreDoItem[]> {
	const { item } = args;
	const status = item.status === "pass" ? 1 : 0;
	const scores: ScoreDoItem[] = [
		{
			name: "trajetoria_deterministica",
			value: status,
			dataType: "NUMERIC",
			comment:
				`Asserts de trajetória do golden-set (${item.status}). ` +
				(args.falhasDeTrajetoria.length > 0
					? `Falhas: ${args.falhasDeTrajetoria.join(" · ")}`
					: "sem falhas.") +
				(item.conversationId ? ` Conversa simulada: ${item.conversationId}.` : ""),
		},
	];

	// B4 — número citado que nenhuma ferramenta devolveu. A fala do cliente é
	// fonte (ecoar o cliente é escutar), igual ao detector em produção. Import
	// preguiçoso: o módulo do detector puxa `@/db` via `publicar.ts`, e o eval
	// roda em ambiente sem banco — sem `--dataset-run`, nada disso carrega.
	const fora: string[] = [];
	if (item.turns.length > 0) {
		const { numerosForaDaCota } = await import("@/lib/observability/sinais/numero-fora-da-cota");
		for (const t of item.turns) {
			for (const n of numerosForaDaCota({
				fala: t.agentText,
				falaDoCliente: t.userMsg,
				resultadosDeTool: t.artifacts.map((a) => a.data),
			}))
				fora.push(n);
		}
	}
	scores.push({
		name: "numero_fora_da_cota",
		value: fora.length > 0,
		dataType: "BOOLEAN",
		comment:
			fora.length > 0
				? `Números sem lastro de ferramenta: ${fora.join(", ")}`
				: "Nenhum número sem lastro de ferramenta.",
	});

	// B5 — promessa de posse/finalização × desfecho real (propostas no banco).
	// Import preguiçoso, mesmo motivo do detector B4.
	const { falaPrometePosseOuFinalizacao } = item.turns.length
		? await import("@/lib/observability/sinais/promessa-sem-fato")
		: { falaPrometePosseOuFinalizacao: null };
	const prometePosse =
		falaPrometePosseOuFinalizacao !== null &&
		item.turns.some((t) => falaPrometePosseOuFinalizacao(t.agentText));
	scores.push({
		name: "promessa_sem_fato",
		value: prometePosse && item.propostas === 0,
		dataType: "BOOLEAN",
		comment: `Fala promete posse/finalização: ${prometePosse ? "sim" : "não"} · propostas em bevi_proposals: ${item.propostas}.`,
	});

	// Juiz offline — 5 dimensões da rubrica. Hipótese, nunca gate: falha de juiz
	// só some as dimensões, o veredito do eval vem dos asserts.
	if (item.turns.length > 0) {
		try {
			// Import preguiçoso: o juiz puxa `@/db` via `publicar.ts`.
			const { judgeConversation } = await import("@/lib/eval/judge");
			const transcrito = item.turns
				.map(
					(t, i) =>
						`Turn ${i + 1}\nCLIENTE: ${t.userMsg}\nVENDEDOR: ${t.agentText}\n[cards: ${t.artifacts.map((a) => a.type).join(", ") || "nenhum"}]`,
				)
				.join("\n\n");
			const resposta = await judgeConversation({
				transcript: transcrito,
				personas: [PERSONA_PADRAO],
				signals: sinaisDeItem({
					turns: item.turns,
					propostas: item.propostas,
					falaPrometida: prometePosse,
					numeroFora: fora,
				}),
				conversationId: null, // calibração offline: sem linha no livro-caixa
			});
			const d = resposta.result.dimensions;
			scores.push(
				{
					name: "judge_engajamento",
					value: d.engajamento.score,
					dataType: "NUMERIC",
					comment: d.engajamento.reasoning,
				},
				{
					name: "judge_discovery",
					value: d.discovery.score,
					dataType: "NUMERIC",
					comment: d.discovery.reasoning,
				},
				{
					name: "judge_continuidade",
					value: d.continuidade.score,
					dataType: "NUMERIC",
					comment: d.continuidade.reasoning,
				},
				{
					name: "judge_naturalidade",
					value: d.naturalidade.score,
					dataType: "NUMERIC",
					comment: d.naturalidade.reasoning,
				},
				{
					name: "judge_assertividade",
					value: d.assertividade.score,
					dataType: "NUMERIC",
					comment: d.assertividade.reasoning,
				},
			);
		} catch (e) {
			console.error(
				`[dataset-run] juiz offline falhou em ${item.cenario} (dimensões não gravadas — hipótese, nunca gate): ${e instanceof Error ? e.message : e}`,
			);
		}
	}
	return scores;
}

async function main(): Promise<void> {
	const only = process.argv.includes("--only")
		? process.argv[process.argv.indexOf("--only") + 1]
		: null;
	const comDatasetRun = process.argv.includes("--dataset-run");

	const sha = gitShaCurto();
	const inicio = new Date();
	// D-0083/Q2: o run é determinístico pela CONDUTA — sha do código + hash da
	// versão publicada da caixa (`caixa_de_prompt`, label de CAIXA_LABEL). Sem
	// banco, cai no fallback do código e o nome fica só `gate-<sha>`; sem
	// timestamp, porque re-run da mesma conduta tem de alimentar O MESMO run.
	let fingerprintDaCaixa: FingerprintDaCaixa = null;
	try {
		const { labelDaCaixa, lerCaixa, limparCacheDaCaixa } = await import("@/lib/agent/box/caixa");
		limparCacheDaCaixa();
		const caixa = await lerCaixa({ label: labelDaCaixa() });
		if (caixa.origem === "banco") {
			fingerprintDaCaixa = { versao: caixa.versao, texto: caixa.texto };
			console.log(`Conduta: caixa publicada v${caixa.versao} (label ${caixa.label}).`);
		} else {
			console.log(`Conduta: sem versão publicada para a label — texto do código.`);
		}
	} catch (e) {
		console.warn(
			`⚠️  leitura da caixa falhou (sha de conduta fica só do código): ${e instanceof Error ? e.message : e}`,
		);
	}
	const runName = nomeDoRunDeConduta(sha, fingerprintDaCaixa);

	const golden = lerGolden().filter((g) => !only || g.cenario === only);
	if (golden.length === 0) {
		console.log(`⚠️  nenhum cenário${only ? ` com --only ${only}` : ""} em ${GOLDEN_DIR}`);
		process.exit(3);
	}

	const sonda: Sonda = escolherSonda(BASE, process.env.EVAL_SONDA);
	console.log(`Sonda de LLM: ${sonda} (alvo ${BASE})`);
	const llm = sonda === "app" ? await probeLlmPeloApp() : await probeLlm();
	if (!llm.ok) {
		console.error(`\n⚠️  LLM INDISPONÍVEL — eval INCONCLUSIVO (não é veredito!): ${llm.reason}\n`);
		process.exit(3);
	}

	console.log(`\n── pnpm eval · ${golden.length} cenário(s) · run ${runName} ──`);

	// B10 — gravador do dataset run: ligado só com `--dataset-run`. Qualquer
	// falha aqui é observabilidade: nunca muda o veredito do gate.
	let gravador: DatasetRunRecorder | null = null;
	if (comDatasetRun) gravador = await DatasetRunRecorder.iniciar({ nome: runName, sha });
	const itemIdsPorCenario: Map<string, string> = gravador
		? new Map(await gravador.itensPorCenario())
		: new Map();

	let pass = 0;
	let fail = 0;
	let skipEnv = 0;
	let inconclusivos = 0;
	const relatorio: Array<{
		cenario: string;
		status: "pass" | "fail" | "skip-env" | "erro" | "inconclusivo";
		turnos: number;
		durMs: number;
		falhas: string[];
		erro?: string;
		/** Sessão simulada no app — o Langfuse indexa os traces do turno por
		 *  session (conversationId); é por aqui que a annotation queue acha o
		 *  cenário de morte na instância (bloco D). */
		conversationId?: string;
	}> = [];

	// B10 — anexa o item executado ao dataset run e grava os scores dele.
	// Fire-and-forget de verdade: nada aqui altera o placar do gate.
	async function gravarNoRun(
		g: Golden,
		status: ItemDoRun["status"],
		out: ItemOutput | null,
		falhas: string[],
	): Promise<void> {
		if (!gravador) return;
		try {
			const turns = (out?.turns ?? []) as NonNullable<ItemOutput["turns"]>;
			const conversationId = out?.conversationId ?? null;
			const propostas = conversationId ? await contarPropostas(conversationId) : 0;
			const item: ItemDoRun = {
				cenario: g.cenario,
				status,
				datasetItemId: itemIdsPorCenario.get(g.cenario) ?? null,
				conversationId,
				turns: turns.map((t) => ({
					userMsg: t.userMsg,
					agentText: t.agentText,
					artifacts: (t.artifacts ?? []) as Array<{ type: string; data: unknown }>,
				})),
				propostas,
			};
			await gravador.anexar(item, await scoresDoItem({ item, falhasDeTrajetoria: falhas }));
		} catch (e) {
			console.error(
				`[dataset-run] gravação de ${g.cenario} falhou (ignorado — observabilidade nunca derruba o gate): ${e instanceof Error ? e.message : e}`,
			);
		}
	}

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
			await gravarNoRun(g, "erro", null, [msg]);
			continue;
		}

		const turns = out.turns ?? [];
		if (out.inconclusivo) {
			inconclusivos++;
			console.log(
				`⚠️  ${g.cenario} — INCONCLUSIVO (HTTP 429 persistente após reenvios; transporte, não conduta)`,
			);
			relatorio.push({
				cenario: g.cenario,
				status: "inconclusivo",
				turnos: turns.length,
				durMs: 0,
				falhas: [],
			});
			await gravarNoRun(g, "inconclusivo", out, []);
			continue;
		}
		const verdict = checkScenario(turns, g.asserts);
		const durMs = turns.reduce((acc, t) => acc + (t.elapsedMs ?? 0), 0);
		relatorio.push({
			cenario: g.cenario,
			status: verdict.pass ? "pass" : "fail",
			turnos: turns.length,
			durMs,
			falhas: verdict.failures,
			...(out.conversationId ? { conversationId: out.conversationId } : {}),
		});
		if (verdict.pass) {
			pass++;
			console.log(`✅ ${g.cenario}  ${turns.length} turnos  ${(durMs / 1000).toFixed(1)}s`);
		} else {
			fail++;
			console.log(`❌ ${g.cenario}  ${turns.length} turnos`);
			for (const f of verdict.failures) console.log(`   └─ ${f}`);
		}
		await gravarNoRun(g, verdict.pass ? "pass" : "fail", out, verdict.failures);

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
	console.log(
		`${pass} PASS · ${fail} FAIL · ${skipEnv} SKIPPED (env) · ${inconclusivos} INCONCLUSIVO (429)`,
	);
	if (skipEnv > 0) {
		console.log(
			"⚠️  cenários pulados por env ausente — o gate NÃO cobre a jornada completa até E2E_TEST_CPF/E2E_TEST_CELULAR existirem.",
		);
	}

	// B10 — score agregado por run (pass rate da trajetória) antes do relatório local.
	if (gravador) {
		const executados = pass + fail;
		try {
			await gravador.agregado({
				name: "trajetoria_deterministica",
				value: executados > 0 ? pass / executados : 0,
				dataType: "NUMERIC",
				comment: `Pass rate do gate ${runName}: ${pass}/${executados} (executados; ${skipEnv} pulados por env, ${inconclusivos} inconclusivos). sha ${sha}.`,
			});
		} catch (e) {
			console.error(
				`[dataset-run] agregado falhou (ignorado): ${e instanceof Error ? e.message : e}`,
			);
		}
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
					sonda,
					aiModel: process.env.AI_MODEL ?? null,
					labelDaCaixa: process.env.CAIXA_LABEL ?? "production",
					pass,
					fail,
					skipEnv,
					inconclusivos,
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
	if (inconclusivos > 0) {
		console.log("⚠️  cenários INCONCLUSIVOS por 429 — gate não verde (inconclusivo ≠ verde).");
		process.exit(3);
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
