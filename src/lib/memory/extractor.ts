// src/lib/memory/extractor.ts
//
// Heurística determinística pra extrair fatos do turno e produzir:
// 1. `entries`: lista de MemoryEntry pra inserir no archival (busca semântica)
// 2. `blockPatch`: Partial<HumanMemoryBlock> pra mesclar no memory_block "human"
//
// SEM LLM — só lê estado estruturado (artifacts produzidos por tool calls +
// `conversations.metadata` campos). Determinístico, gratuito, auditável.

import type { ProducedArtifact } from "@/lib/agent/orchestrator/types";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { simulatorNow } from "@/lib/utils/simulator-clock";

import type { HumanMemoryBlock, MemoryEntry, MemoryEntryKind } from "./types";

export interface ExtractedMemories {
	entries: MemoryEntry[];
	blockPatch: Partial<HumanMemoryBlock>;
}

/**
 * Extrai memórias estruturadas de um turno completo (artifacts + meta).
 * Idempotente — chamar 2x produz mesma saída. Não throw em payloads
 * inesperados; campos faltantes são silenciosamente ignorados.
 */
export function extractMemoriesFromTurn(args: {
	artifacts: ProducedArtifact[];
	meta: ConversationMetadata;
	channel: "web" | "whatsapp";
	userText: string;
}): ExtractedMemories {
	const { artifacts, meta, channel } = args;
	const entries: MemoryEntry[] = [];
	const blockPatch: Partial<HumanMemoryBlock> = {};
	const today = simulatorNow().toISOString();

	// ─── 1. Artifacts produzidos pelo agent ─────────────────────────────────

	for (const artifact of artifacts) {
		const payload = artifact.payload;

		if (artifact.type === "simulation_result") {
			const creditValue = numeric(payload.creditValue ?? payload.credit_value);
			const termMonths = numeric(payload.termMonths ?? payload.term_months);
			const monthlyPrice = numeric(
				payload.monthlyPrice ?? payload.monthly_price ?? payload.monthlyPayment,
			);
			if (creditValue && termMonths && monthlyPrice) {
				blockPatch.lastSimulation = {
					creditValue,
					termMonths,
					monthlyPrice,
					date: today,
				};
				entries.push({
					text: `Simulou consórcio: R$ ${formatBRL(creditValue)} em ${termMonths} meses, parcela mensal R$ ${formatBRL(monthlyPrice)}.`,
					kind: "simulation",
					metadata: { creditValue, termMonths, monthlyPrice },
				});
			}
		}

		if (artifact.type === "recommendation_card") {
			const label = stringOf(payload.label ?? payload.title);
			const groupId = stringOf(payload.groupId ?? payload.group_id ?? payload.id);
			if (label && groupId) {
				blockPatch.lastRecommendation = { label, groupId, date: today };
				entries.push({
					text: `Recebeu recomendação final: ${label} (grupo ${groupId}).`,
					kind: "recommendation",
					metadata: { groupId },
				});
			}
		}

		if (artifact.type === "group_card") {
			const label = stringOf(payload.label ?? payload.title ?? payload.name);
			const category = stringOf(payload.category) as HumanMemoryBlock["category"] | undefined;
			if (label) {
				entries.push({
					text: `Visualizou grupo: ${label}.`,
					kind: "preference",
					metadata: category ? { category } : undefined,
				});
			}
		}

		if (artifact.type === "comparison_table") {
			const groups = payload.groups;
			if (Array.isArray(groups)) {
				entries.push({
					text: `Comparou ${groups.length} grupos de consórcio.`,
					kind: "fact",
				});
			}
		}
	}

	// ─── 2. Metadados estruturados da sessão ────────────────────────────────

	if (meta.currentCategory) blockPatch.category = meta.currentCategory;
	if (meta.expertiseLevel) blockPatch.expertiseLevel = meta.expertiseLevel as HumanMemoryBlock["expertiseLevel"];

	if (meta.qualifyAnswers) {
		const q = meta.qualifyAnswers as Record<string, unknown>;
		const creditMin = numeric(q.creditMin ?? q.credit_min);
		const creditMax = numeric(q.creditMax ?? q.credit_max);
		const monthlyBudget = numeric(q.monthlyBudget ?? q.monthly_budget);
		const termMonths = numeric(q.termMonths ?? q.term_months ?? q.termMonthsPreferred);
		if (creditMin) blockPatch.creditMin = creditMin;
		if (creditMax) blockPatch.creditMax = creditMax;
		if (monthlyBudget) blockPatch.monthlyBudget = monthlyBudget;
		if (termMonths) blockPatch.termMonthsPreferred = termMonths;
	}

	// Lead capture parcial — só populamos se já houver
	if (meta.leadCollection) {
		if (meta.leadCollection.name) blockPatch.name = meta.leadCollection.name;
		if (meta.leadCollection.phone) {
			const e164 = meta.leadCollection.phone.startsWith("+")
				? meta.leadCollection.phone
				: `+55${meta.leadCollection.phone.replace(/\D/g, "")}`;
			blockPatch.phone = e164;
		}
	}

	// Stage máximo já alcançado nesta conversa
	if (meta.maxStageReached) {
		blockPatch.stage = meta.maxStageReached;
	}

	// Canal usado (deduplicação fica no adapter)
	blockPatch.channels = [channel];

	return { entries, blockPatch };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function numeric(v: unknown): number | undefined {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string") {
		const cleaned = v.replace(/[^\d.,-]/g, "").replace(",", ".");
		const n = Number.parseFloat(cleaned);
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

function stringOf(v: unknown): string | undefined {
	if (typeof v === "string" && v.trim().length > 0) return v.trim();
	return undefined;
}

function formatBRL(n: number): string {
	return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Re-export pra docs
export type { MemoryEntryKind };
