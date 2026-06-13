// src/lib/memory/letta-client.ts
//
// Cliente HTTP REST pro Letta. Descobre o endpoint via:
// 1. LETTA_SRV_NAME → SRV record DNS (prod ECS via Cloud Map) — TEM PRECEDÊNCIA
// 2. LETTA_BASE_URL (override explícito — dev local: localhost sem SRV)
//
// Precedência do SRV é deliberada (BUG-LETTA-SRV-IGNORADO, 2026-06-13): em prod
// AMBOS ficam no secret, mas o LETTA_BASE_URL pode ser resíduo (ex.: apontar pro
// nome SRV-only `letta-srv.tb.local:8283`, que não tem A record → fetch dá
// ENOTFOUND e a memória cai no fallback silencioso). Quando há SRV_NAME, o lookup
// descobre IP+porta REAIS do host (bridge mode = porta dinâmica) — é a fonte certa.
// LETTA_BASE_URL só rege quando NÃO há SRV_NAME (dev local aponta pra localhost).
//
// Aplica timeout via AbortController, retorna `null`/throw conforme contrato.
// Ver skill TwoBrains `shared-letta` pra topologia em prod.

import dns from "node:dns/promises";

import { MemoryError, MemoryTimeoutError } from "./types";

const DEFAULT_TIMEOUT_MS = 2000;
const SRV_CACHE_TTL_MS = 30_000;

let _baseUrlCache: { url: string; expiresAt: number } | null = null;

/**
 * Resolve a URL base do Letta. Cacheia por 30s pra reduzir overhead de SRV
 * lookup em prod. SRV_NAME tem precedência sobre BASE_URL (ver cabeçalho —
 * BUG-LETTA-SRV-IGNORADO); BASE_URL só rege em dev local (sem SRV_NAME).
 */
export async function resolveLettaBaseUrl(): Promise<string> {
	const srvName = process.env.LETTA_SRV_NAME?.trim();
	if (!srvName) {
		const direct = process.env.LETTA_BASE_URL;
		if (direct) return direct;
		throw new MemoryError("Letta endpoint not configured (set LETTA_BASE_URL or LETTA_SRV_NAME)");
	}

	if (_baseUrlCache && Date.now() < _baseUrlCache.expiresAt) {
		return _baseUrlCache.url;
	}

	const records = await dns.resolveSrv(srvName);
	if (!records.length) {
		throw new MemoryError(`SRV ${srvName} returned 0 records`);
	}
	const r = records.sort((a, b) => a.priority - b.priority || b.weight - a.weight)[0];
	const ips = await dns.resolve4(r.name);
	if (!ips.length) {
		throw new MemoryError(`A record for ${r.name} returned 0 IPs`);
	}
	const url = `http://${ips[0]}:${r.port}`;
	_baseUrlCache = { url, expiresAt: Date.now() + SRV_CACHE_TTL_MS };
	return url;
}

/** Reset cache — útil em testes ou após mudança de SRV. */
export function resetLettaBaseUrlCache(): void {
	_baseUrlCache = null;
}

export interface LettaFetchOptions extends Omit<RequestInit, "signal"> {
	timeoutMs?: number;
}

/**
 * Fetch genérico contra a API REST do Letta. Aplica timeout e
 * `Authorization: Bearer ${LETTA_API_KEY}`. Lança `MemoryTimeoutError` em
 * timeout, `MemoryError` em qualquer erro HTTP/parse.
 */
export async function lettaFetch<T>(path: string, opts: LettaFetchOptions = {}): Promise<T> {
	const baseUrl = await resolveLettaBaseUrl();
	const apiKey = process.env.LETTA_API_KEY;
	if (!apiKey) {
		throw new MemoryError("LETTA_API_KEY not configured");
	}

	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(`${baseUrl}${path}`, {
			...opts,
			signal: controller.signal,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				...(opts.headers ?? {}),
			},
		});
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new MemoryError(
				`Letta ${opts.method ?? "GET"} ${path} failed: HTTP ${response.status} ${body}`,
			);
		}
		if (response.status === 204) {
			return undefined as T;
		}
		return (await response.json()) as T;
	} catch (err) {
		if (err instanceof Error && err.name === "AbortError") {
			throw new MemoryTimeoutError(`${opts.method ?? "GET"} ${path}`, timeoutMs);
		}
		if (err instanceof MemoryError) throw err;
		throw new MemoryError(`Letta fetch error (${path})`, err);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Smoke test do endpoint Letta. Retorna `true` se /v1/health/ responde 200.
 * Usado pelo factory em runtime pra decidir se vale a pena habilitar
 * o adapter Letta ou cair pro Noop.
 */
export async function lettaHealthCheck(timeoutMs = 1000): Promise<boolean> {
	try {
		await lettaFetch<{ status: string }>("/v1/health/", { timeoutMs });
		return true;
	} catch {
		return false;
	}
}
