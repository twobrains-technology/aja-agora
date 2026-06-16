import type { EvalDimensionPayload, EvalDimensionsPayload, EvalFlagsPayload } from "@/db/schema";
import type { DeterministicSignals, LeadStage, SignalsLead } from "./signals";

export type { DeterministicSignals } from "./signals";

export function pickPrimaryLead(
	leads: Array<{
		stage: LeadStage;
		name: string | null;
		phone: string | null;
		email: string | null;
	}>,
): SignalsLead {
	if (leads.length === 0) return null;
	return leads[0];
}

export function computeConversaoDimension(signals: DeterministicSignals): EvalDimensionPayload {
	const stage = signals.conversionStage;
	const reasoning = `Stage do lead: ${stage}. Lead capturado: ${signals.hasLead ? "sim" : "não"}.`;
	const score = scoreConversao(stage, signals.hasLead);
	return { score, reasoning };
}

export function scoreConversao(stage: LeadStage, hasLead: boolean): number {
	if (stage === "fechado_ganho") return 1.0;
	// FIX-43: split do fechamento — pós-proposta, quase-fechados (mesa da
	// administradora → boleto). Score alto e monotônico rumo ao fechamento.
	if (stage === "aguardando_pagamento") return 0.98;
	if (stage === "na_administradora") return 0.97;
	if (stage === "proposta_enviada") return 0.95;
	if (stage === "em_negociacao") return 0.85;
	if (stage === "qualificado") return hasLead ? 1.0 : 0.7;
	if (stage === "engajado") return hasLead ? 0.6 : 0.4;
	if (stage === "perdido") return 0.1;
	return 0.0; // novo
}

export function computeFlags(
	judgeFlags: EvalFlagsPayload,
	dimensions: EvalDimensionsPayload,
	signals: DeterministicSignals,
): EvalFlagsPayload {
	return {
		// Hallucination: juiz é primário, mas backstop determinístico se há números
		// citados sem fonte em artifact (sinal forte mesmo se juiz não pegou).
		hallucination: judgeFlags.hallucination || signals.numbersInTextFlagged.length > 0,
		missedHandoff: judgeFlags.missedHandoff,
		// Limiares determinísticos vencem se mais severos que o juízo do LLM.
		incompleteDiscovery: judgeFlags.incompleteDiscovery || dimensions.discovery.score < 0.4,
		lowEngagement: judgeFlags.lowEngagement || dimensions.engajamento.score < 0.3,
	};
}

export function average(scores: number[]): number {
	if (scores.length === 0) return 0;
	return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}
