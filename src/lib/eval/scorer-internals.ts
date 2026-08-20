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
	const desfecho = {
		propostas: signals.propostas,
		contratoFechado: signals.contratoFechado,
	};
	const reasoning =
		`Propostas geradas: ${signals.propostas}. Contrato fechado: ${signals.contratoFechado ? "sim" : "não"}. ` +
		`Stage do lead: ${stage}. Lead capturado: ${signals.hasLead ? "sim" : "não"}.`;
	const score = scoreConversao(stage, signals.hasLead, desfecho);
	return { score, reasoning };
}

/** O que a conversa REALMENTE produziu — não o que o kanban acha dela. */
export type DesfechoDaConversa = {
	/** Linhas em `bevi_proposals` para esta conversa. */
	propostas: number;
	/** `contractClosed` no metadata — o self-service concluiu. */
	contratoFechado: boolean;
};

/** Teto de quem não gerou proposta nenhuma. Acima disto, a nota estaria dizendo
 * que a conversa converteu — e ela não converteu. */
const TETO_SEM_PROPOSTA = 0.4;

/**
 * CONVERSÃO SE MEDE PELO DESFECHO.
 *
 * Isto era um mapa fixo de estágio de lead, e o estágio é promovido a
 * `em_negociacao` em QUALQUER turno de usuário após o reveal. Somando as duas
 * coisas, "nota de conversão 0,85" significava, literalmente, "o cliente falou
 * depois de ver os cards" — foi a nota que a conversa da Rute recebeu, com zero
 * propostas e a cliente indo embora (PRD 19/08/2026, §5.1).
 *
 * Agora o desfecho manda e o estágio só refina:
 *   • contrato fechado                  → 1,0
 *   • proposta real gerada              → 0,65 a 0,9, conforme o estágio
 *   • nenhuma proposta                  → teto de 0,4, seja qual for o estágio
 *
 * A monotonicidade também estava quebrada: `qualificado + lead` dava 1,0, acima
 * de `proposta_enviada` (0,95). Morrer qualificado pontuava mais que mandar
 * proposta. Aqui nada supera quem chegou mais longe.
 */
export function scoreConversao(
	stage: LeadStage,
	hasLead: boolean,
	desfecho: DesfechoDaConversa,
): number {
	if (desfecho.contratoFechado || stage === "fechado_ganho") return 1.0;

	if (desfecho.propostas > 0) {
		// Pós-proposta: o estágio diz o quanto ela andou DEPOIS de existir.
		if (stage === "aguardando_pagamento") return 0.9;
		if (stage === "na_administradora") return 0.85;
		if (stage === "proposta_enviada") return 0.8;
		// A proposta existe e o kanban ficou para trás (3 das 7 conversas com
		// proposta real estavam marcadas como `perdido`): o que aconteceu vale mais
		// que o rótulo. Perdido com proposta ainda é muito mais que sem proposta.
		if (stage === "perdido") return 0.65;
		return 0.75;
	}

	// Sem proposta nenhuma: independentemente do que o kanban diga.
	if (stage === "perdido") return 0.05;
	if (stage === "novo") return 0.0;
	if (stage === "engajado") return hasLead ? 0.25 : 0.15;
	if (stage === "qualificado") return hasLead ? TETO_SEM_PROPOSTA : 0.3;
	// `em_negociacao`, `em_atendimento`, e até `proposta_enviada` sem nenhuma
	// linha em `bevi_proposals` — que é incoerência de estado, não conversão.
	//
	// Fica ABAIXO de `qualificado + lead` (0,40) de propósito, e isso não
	// contradiz a monotonicidade: `em_negociacao` não é um estágio conquistado,
	// é ruído — `persist.ts` promove o lead a ele em QUALQUER turno de usuário
	// depois do reveal (defeito D10 do PRD). Pontuar esse rótulo acima de quem
	// entregou dados de contato seria premiar exatamente o artefato que o §5
	// mandou parar de premiar.
	return hasLead ? 0.35 : 0.25;
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
