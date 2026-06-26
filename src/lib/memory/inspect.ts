// src/lib/memory/inspect.ts
//
// Helper de inspeção pro simulator dev tool. Retorna snapshot completo da
// memória da identidade da conversa simulada — bloco humano, preview do hint de
// reativação que seria injetado no próximo turno, e estado do clock simulado.
//
// Read-only: nada de side-effect; nunca grava nada. Se identity não existe,
// retorna shape com `agentExists: false`. Fala com a memória pelo factory
// (`getMemoryAdapter()`) — backend-agnóstico (FIX-81: Postgres no lugar do Letta).

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import {
	getNamespace,
	identityFromCookie,
	identityFromWaId,
	shouldCreateAnonAgent,
} from "./identity";
import { getMemoryAdapter } from "./index";
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
	/**
	 * Disponibilidade do backend de memória. Após FIX-81 a memória vive no
	 * mesmo Postgres do app (co-localizada) — sempre `true`. Mantido no shape
	 * por compatibilidade com a UI dev do simulador.
	 */
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
 * Lê snapshot de memória pra UI do simulador via `getMemoryAdapter().loadContext`
 * (timeout 2.5s). Read-only — nunca grava. Backend-agnóstico (Postgres, FIX-81).
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

	// Tenta carregar contexto. Timeout/erro = retorna `null` (não throw).
	const adapter = getMemoryAdapter();
	const context = await adapter
		.loadContext(identity, { timeoutMs: 2500, archivalQuery: "" })
		.catch(() => null);

	if (!context) {
		// Identidade existe mas ainda não há linha de memória pra ela.
		return {
			identity,
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

	// Archival semântico saiu na fase 1 (FIX-81) — sample vazio (pgvector é fase 2).
	const archivalSample: ArchivalHit[] = [];

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
