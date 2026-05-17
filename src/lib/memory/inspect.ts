// src/lib/memory/inspect.ts
//
// Helper de inspeção pro simulator dev tool. Retorna snapshot completo da
// memória Letta da identidade da conversa simulada — bloco humano, archival
// sample, preview do hint de reativação que seria injetado no próximo turno,
// e estado do clock simulado.
//
// Read-only: nada de side-effect; nunca cria agent novo. Se identity não
// existe ou Letta indisponível, retorna shape com `agentExists: false`.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import {
	getNamespace,
	identityFromCookie,
	identityFromWaId,
	shouldCreateAnonAgent,
} from "./identity";
import { LettaMemoryAdapter } from "./letta-adapter";
import { lettaFetch } from "./letta-client";
import { buildReactivationHint } from "./reactivation";
import type { ArchivalHit, HumanMemoryBlock, UserIdentity } from "./types";

export interface MemoryInspectResult {
	identity: UserIdentity | null;
	agentExists: boolean;
	block: HumanMemoryBlock | null;
	daysSinceLastInteraction: number | null;
	reactivationHint: string | null;
	archivalSample: ArchivalHit[];
	clockOffsetMs: number;
	simulatedNow: string;
	/** Letta circuit aberto ou indisponível — UI mostra banner. */
	lettaAvailable: boolean;
	/** Conv web abaixo do threshold de criação automática. null se whatsapp ou web ≥ threshold. */
	webEngagementProgress: { current: number; required: number } | null;
}

interface InspectArgs {
	conversation: {
		id: string;
		channel: "web" | "whatsapp";
		waId: string | null;
		metadata: unknown;
	};
}

/**
 * Lê snapshot de memória pra UI do simulador. Usa `LettaMemoryAdapter.loadContext`
 * direto (timeout 2s, com archivalQuery genérica). Não cria agent novo.
 */
export async function inspectSimulatorMemory({
	conversation,
}: InspectArgs): Promise<MemoryInspectResult> {
	const meta = (conversation.metadata as Record<string, unknown> | null) ?? {};
	const simMeta = (meta.simulator as Record<string, unknown> | undefined) ?? {};
	const clockOffsetMs = numericOrZero(simMeta.clockOffsetMs);
	const simulatedNow = new Date(Date.now() + clockOffsetMs).toISOString();
	const namespace = getNamespace();

	const identity = resolveIdentity(conversation, namespace);

	// Web threshold progress (paridade com `shouldCreateAnonAgent`).
	let webEngagementProgress: MemoryInspectResult["webEngagementProgress"] = null;
	if (conversation.channel === "web") {
		const userTurnCount = await countUserTurns(conversation.id);
		if (!shouldCreateAnonAgent(userTurnCount)) {
			webEngagementProgress = { current: userTurnCount, required: 3 };
		}
	}

	if (!identity) {
		return {
			identity: null,
			agentExists: false,
			block: null,
			daysSinceLastInteraction: null,
			reactivationHint: null,
			archivalSample: [],
			clockOffsetMs,
			simulatedNow,
			lettaAvailable: true,
			webEngagementProgress,
		};
	}

	// Tenta carregar contexto. Timeout/erro/circuit = retorna `null` (não throw).
	const adapter = new LettaMemoryAdapter();
	const context = await adapter
		.loadContext(identity, { timeoutMs: 2500, archivalQuery: "" })
		.catch(() => null);

	if (!context) {
		// Distingue: identidade existe mas agent não OU Letta indisponível.
		// Tentamos um health check rápido pra decidir.
		const available = await quickHealthCheck();
		return {
			identity,
			agentExists: false,
			block: null,
			daysSinceLastInteraction: null,
			reactivationHint: null,
			archivalSample: [],
			clockOffsetMs,
			simulatedNow,
			lettaAvailable: available,
			webEngagementProgress,
		};
	}

	// Archival sample — lista 10 mais recentes (best-effort).
	const archivalSample = await listArchivalSample(context.agentId).catch(() => []);

	// `daysSinceLastInteraction` do `loadContext` foi calculado com `new Date()`
	// dentro do adapter (que respeita ALS quando dentro do scope; aqui o GET roda
	// fora do scope, então é tempo real). Pra UI do simulador, recalculamos
	// usando o tempo simulado da conversa pra alinhar com o que o próximo turno
	// vai sentir.
	const simulatedDate = new Date(Date.now() + clockOffsetMs);
	const daysSinceLastInteraction = simulatedDaysBetween(
		context.block.lastInteractionAt,
		simulatedDate,
	);

	const reactivationHint = buildReactivationHint(context.block, daysSinceLastInteraction);

	return {
		identity,
		agentExists: true,
		block: context.block,
		daysSinceLastInteraction,
		reactivationHint,
		archivalSample,
		clockOffsetMs,
		simulatedNow,
		lettaAvailable: true,
		webEngagementProgress,
	};
}

function resolveIdentity(
	conv: { channel: "web" | "whatsapp"; waId: string | null; metadata: unknown },
	namespace: string,
): UserIdentity | null {
	if (conv.channel === "whatsapp") {
		if (!conv.waId) return null;
		try {
			return identityFromWaId(conv.waId, namespace);
		} catch {
			return null;
		}
	}
	// channel === "web" — identity vem de cookie persistido em
	// `metadata.simulator.lettaCookieKey` (gravado pelo entrypoint do simulator
	// web na 1ª passagem onde o orchestrator resolveu a identity cookie).
	// Sem isso, GET /memory de outros admins do mesmo time não tem como
	// reconstruir a identity (cookie é por-browser).
	const meta = (conv.metadata as Record<string, unknown> | null) ?? {};
	const simMeta = (meta.simulator as Record<string, unknown> | undefined) ?? {};
	const cookieKey = typeof simMeta.lettaCookieKey === "string" ? simMeta.lettaCookieKey : null;
	if (!cookieKey) return null;
	try {
		return identityFromCookie(cookieKey, namespace);
	} catch {
		return null;
	}
}

async function countUserTurns(conversationId: string): Promise<number> {
	const rows = await db
		.select({ id: messages.id })
		.from(messages)
		.where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")));
	return rows.length;
}

async function listArchivalSample(agentId: string): Promise<ArchivalHit[]> {
	interface LettaPassage {
		id: string;
		text: string;
		tags?: string[] | null;
		created_at: string;
	}
	const passages = await lettaFetch<LettaPassage[]>(
		`/v1/agents/${agentId}/archival-memory?limit=10`,
		{ timeoutMs: 2500 },
	);
	return passages.map((p) => ({
		id: p.id,
		text: p.text,
		score: 0,
		createdAt: p.created_at,
		metadata: p.tags ? { tags: p.tags } : undefined,
	}));
}

async function quickHealthCheck(): Promise<boolean> {
	try {
		await lettaFetch<{ status: string }>("/v1/health/", { timeoutMs: 800 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Como `daysBetween` do letta-adapter mas inverte protege contra valores
 * negativos (após reset, `lastInteractionAt` pode estar no futuro). Retorna
 * 0 quando diff seria negativo — UI não mostra "-10 dias".
 */
function simulatedDaysBetween(isoA: string | undefined, dateB: Date): number | null {
	if (!isoA) return null;
	const a = new Date(isoA).getTime();
	if (Number.isNaN(a)) return null;
	const diffMs = dateB.getTime() - a;
	if (diffMs < 0) return 0;
	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function numericOrZero(v: unknown): number {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const n = Number(v);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
}
