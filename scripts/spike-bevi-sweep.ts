// FIX-69 — Spike de validação ao vivo da Bevi (gate técnico do sweep multi-faixa).
//
// Mede os DOIS números que o cookbook (docs/integracoes/bevi-api-requests.md) NÃO
// documenta e que decidem se "sweep sequencial de 3-5 faixas" é viável em UX:
//
//   1. Latência por `simulate` QUENTE (sem cold-start) — p50/p95, repetido.
//   2. Rate-limit / throttling da Bevi numa RAJADA de PATCHs `simulation` na
//      mesma proposta (sonda 429 / erro acima de X req/s).
//
// É um script ONE-SHOT de diagnóstico (NÃO é caminho de runtime). Reusa o
// BeviSelfContractClient real — a mesma latência que produção sente, inclusive o
// retry de 404 transitório (cookbook §5b) e o timeout estendido da simulação.
//
// ── Como rodar (precisa de credencial da loja-piloto) ──
//   BEVI_SELFCONTRACT_HASH=<hash da loja> \
//   BEVI_SPIKE_CPF=<cpf de teste> \
//   BEVI_SPIKE_CELULAR=<celular> \
//   pnpm dlx tsx scripts/spike-bevi-sweep.ts
//
// Env opcionais:
//   BEVI_SELFCONTRACT_BASE_URL  (default = produção self-contract)
//   BEVI_SPIKE_SEGMENT          (default AUTOS)
//   BEVI_SPIKE_VALUES           (default "80000,100000,130000,150000,200000")
//   BEVI_SPIKE_ROUNDS           (default 3 — rodadas por valor pra p50/p95)
//   BEVI_SPIKE_BURST            (default 8 — nº de simulações back-to-back na sonda)
//   BEVI_SPIKE_GAP_MS           (default 0 — gap na rajada; 0 = pressão máxima)
//
// ⚠️ Sem BEVI_SELFCONTRACT_HASH o client falha alto (loadSelfContractConfigFromEnv).
// Se o worktree não tiver o hash, NÃO trava o bloco: o resultado fica PENDENTE-KAIRO
// (o operador roda depois). O FIX-70 procede com defaults conservadores — o spike
// só CALIBRA os parâmetros (nº de faixas, gap, maxSweepMs).

import { DuplicatedProposalError } from "@/lib/adapters/bevi/bevi-errors";
import {
	BeviSelfContractClient,
	loadSelfContractConfigFromEnv,
} from "@/lib/adapters/bevi/self-contract-client";

interface SampleResult {
	value: number;
	round: number;
	latencyMs: number;
	offers: number;
	status: "ok" | "empty" | "error";
	errorName?: string;
	errorCode?: number;
}

const num = (v: string | undefined, fallback: number) => {
	const n = Number(v);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};

const SEGMENT = (process.env.BEVI_SPIKE_SEGMENT ?? "AUTOS").trim().toUpperCase();
const VALUES = (process.env.BEVI_SPIKE_VALUES ?? "80000,100000,130000,150000,200000")
	.split(",")
	.map((s) => Number(s.trim()))
	.filter((n) => Number.isFinite(n) && n > 0);
const ROUNDS = num(process.env.BEVI_SPIKE_ROUNDS, 3);
const BURST = num(process.env.BEVI_SPIKE_BURST, 8);
const BURST_GAP_MS = Number(process.env.BEVI_SPIKE_GAP_MS ?? 0) || 0;

const CPF = (process.env.BEVI_SPIKE_CPF ?? "").trim();
const CELULAR = (process.env.BEVI_SPIKE_CELULAR ?? "").trim();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Percentil simples (nearest-rank) sobre amostras de latência. */
function percentile(samples: number[], p: number): number {
	if (samples.length === 0) return Number.NaN;
	const sorted = [...samples].sort((a, b) => a - b);
	const rank = Math.ceil((p / 100) * sorted.length);
	return sorted[Math.min(rank, sorted.length) - 1];
}

/** Uma simulação cronometrada — captura latência, nº de ofertas, status e erro. */
async function timedSimulate(
	client: BeviSelfContractClient,
	value: number,
	round: number,
): Promise<SampleResult> {
	const start = Date.now();
	try {
		const offers = await client.simulate({ simulationValue: value });
		const latencyMs = Date.now() - start;
		return {
			value,
			round,
			latencyMs,
			offers: offers.length,
			status: offers.length > 0 ? "ok" : "empty",
		};
	} catch (err) {
		const latencyMs = Date.now() - start;
		const e = err as { name?: string; code?: number };
		return {
			value,
			round,
			latencyMs,
			offers: 0,
			status: "error",
			errorName: e?.name ?? "unknown",
			errorCode: typeof e?.code === "number" ? e.code : undefined,
		};
	}
}

async function main() {
	if (!CPF || !CELULAR) {
		console.error(
			"[spike] BEVI_SPIKE_CPF e BEVI_SPIKE_CELULAR são obrigatórios (a Bevi exige " +
				"CPF+celular pra criar proposta — não há simulação anônima). Abortando.",
		);
		process.exit(2);
	}

	// loadSelfContractConfigFromEnv falha alto sem BEVI_SELFCONTRACT_HASH.
	const config = loadSelfContractConfigFromEnv();
	const client = new BeviSelfContractClient(config);

	console.log("══════════════════════════════════════════════════════════════");
	console.log(" SPIKE Bevi sweep — latência quente + sonda de rate-limit");
	console.log("══════════════════════════════════════════════════════════════");
	console.log(`  baseUrl   : ${config.baseUrl}`);
	console.log(`  storeHash : ${config.storeHash.slice(0, 8)}…`);
	console.log(`  segmento  : ${SEGMENT}`);
	console.log(`  valores   : ${VALUES.join(", ")}`);
	console.log(`  rodadas   : ${ROUNDS} por valor   |  rajada: ${BURST} (gap ${BURST_GAP_MS}ms)`);
	console.log("──────────────────────────────────────────────────────────────");

	// 1) Proposta + segmento (1 proposta ativa por device — cookbook §3).
	try {
		await client.createProposal({ cpf: CPF, celular: CELULAR });
		console.log("[spike] proposta criada.");
	} catch (err) {
		if (err instanceof DuplicatedProposalError) {
			console.log("[spike] proposta ativa já existe pro device → retomando (esperado).");
		} else {
			throw err;
		}
	}
	await client.setSegment(SEGMENT);
	console.log(`[spike] segmento ${SEGMENT} gravado.`);

	// 2) Warm-up: descarta a 1ª simulação (cold-start do app DigitalOcean).
	const warm = await timedSimulate(client, VALUES[0], 0);
	console.log(
		`[spike] warm-up (descartado): valor ${VALUES[0]} → ${warm.latencyMs}ms ` +
			`(${warm.status}, ${warm.offers} ofertas)`,
	);

	// 3) Latência quente — R rodadas por valor.
	const samples: SampleResult[] = [];
	console.log("\n── Latência por simulate (quente) ──");
	console.log("valor       | rodada | latência | ofertas | status");
	for (const value of VALUES) {
		for (let r = 1; r <= ROUNDS; r++) {
			const s = await timedSimulate(client, value, r);
			samples.push(s);
			console.log(
				`${String(value).padStart(11)} | ${String(r).padStart(6)} | ` +
					`${String(s.latencyMs).padStart(6)}ms | ${String(s.offers).padStart(7)} | ` +
					`${s.status}${s.errorName ? ` (${s.errorName}${s.errorCode ? ` ${s.errorCode}` : ""})` : ""}`,
			);
			await sleep(400); // gap "educado" do cookbook §6 entre medições normais
		}
	}

	const okLatencies = samples.filter((s) => s.status !== "error").map((s) => s.latencyMs);
	console.log("\n── Resumo de latência (quente, exclui erros) ──");
	console.log(`  amostras : ${okLatencies.length}`);
	console.log(`  min      : ${Math.min(...okLatencies)}ms`);
	console.log(`  p50      : ${percentile(okLatencies, 50)}ms`);
	console.log(`  p95      : ${percentile(okLatencies, 95)}ms`);
	console.log(`  max      : ${Math.max(...okLatencies)}ms`);

	// 4) Sonda de rate-limit — rajada back-to-back (gap configurável, default 0).
	console.log(`\n── Sonda de rate-limit (rajada de ${BURST}, gap ${BURST_GAP_MS}ms) ──`);
	const burst: SampleResult[] = [];
	const burstValue = VALUES[Math.floor(VALUES.length / 2)] ?? VALUES[0];
	for (let i = 1; i <= BURST; i++) {
		const s = await timedSimulate(client, burstValue, i);
		burst.push(s);
		console.log(
			`  #${String(i).padStart(2)} → ${String(s.latencyMs).padStart(6)}ms  ${s.status}` +
				`${s.errorName ? ` (${s.errorName}${s.errorCode ? ` ${s.errorCode}` : ""})` : ""}`,
		);
		if (BURST_GAP_MS > 0) await sleep(BURST_GAP_MS);
	}
	const throttled = burst.filter(
		(s) => s.status === "error" && (s.errorCode === 429 || /throttle/i.test(s.errorName ?? "")),
	);
	const anyError = burst.filter((s) => s.status === "error");
	console.log("\n── Veredito de rate-limit ──");
	if (throttled.length > 0) {
		console.log(`  ⚠️ THROTTLE observado: ${throttled.length}/${BURST} respostas 429/throttle.`);
		console.log("  → sweep precisa de gap maior / circuit breaker mais agressivo.");
	} else if (anyError.length > 0) {
		console.log(
			`  ${anyError.length}/${BURST} erros NÃO-throttle (${anyError.map((e) => e.errorName).join(", ")}).`,
		);
		console.log("  → provável transitório/timeout, não rate-limit. Reveja antes de concluir.");
	} else {
		console.log(
			`  ✅ Nenhum throttle em rajada de ${BURST} sem gap. Rate-limit não observado nessa pressão.`,
		);
	}

	console.log("\n── Recomendação de calibração do FIX-70 ──");
	const p95 = percentile(okLatencies, 95);
	const safeBands = Number.isFinite(p95) && p95 > 0 ? Math.max(1, Math.floor(8000 / p95)) : 3;
	console.log(`  p95≈${p95}ms → ~${safeBands} faixas cabem num budget de ~8s (maxSweepMs).`);
	console.log(
		`  gap sugerido: ${throttled.length > 0 ? ">=800ms (throttle visto)" : "400ms (sem throttle)"}.`,
	);
	console.log("══════════════════════════════════════════════════════════════");
}

main().catch((err) => {
	console.error("[spike] FALHA:", err);
	process.exit(1);
});
