// src/lib/memory/reactivation.ts
//
// Build hint de reativação pra prepend ao system prompt quando o usuário
// volta após N dias. Estratégia determinística — sem LLM. O agent lê o hint
// e ajusta tom naturalmente (mais direto, retoma onde parou).

import type { HumanMemoryBlock, MemoryContext } from "./types";

/**
 * Retorna um system message extra com contexto da memória pra o agent.
 * Combina:
 * 1. Estado conhecido do usuário (nome, stage, preferências) — sempre
 *    incluso quando há agent.
 * 2. Hint de reativação se daysSinceLastInteraction >= 1.
 * 3. Top archival hits relevantes ao turno atual (se buscados).
 *
 * Retorna `null` se `context` é vazio/inútil — caller decide se injeta ou não.
 */
export function buildMemorySystemMessage(context: MemoryContext | null): string | null {
	if (!context) return null;
	const lines: string[] = [];

	const blockSummary = summarizeBlock(context.block);
	if (blockSummary) lines.push(`[CONTEXTO DO USUÁRIO]\n${blockSummary}`);

	const reactivation = buildReactivationHint(context.block, context.daysSinceLastInteraction);
	if (reactivation) lines.push(reactivation);

	if (context.archivalHits.length > 0) {
		const hits = context.archivalHits
			.slice(0, 3)
			.map((h, i) => `${i + 1}. ${h.text}`)
			.join("\n");
		lines.push(`[FATOS RELEVANTES DE INTERAÇÕES PASSADAS]\n${hits}`);
	}

	return lines.length > 0 ? lines.join("\n\n") : null;
}

/**
 * Sumariza o memory_block em texto humano. Retorna null se block é vazio.
 */
function summarizeBlock(block: HumanMemoryBlock): string | null {
	const parts: string[] = [];
	if (block.name) parts.push(`Nome: ${block.name}`);
	if (block.stage) parts.push(`Estágio atual: ${block.stage}`);
	if (block.category) {
		const categoryLabel: Record<typeof block.category & string, string> = {
			imovel: "imóvel",
			auto: "auto",
			moto: "moto",
			servicos: "serviços",
		};
		parts.push(`Categoria de interesse: ${categoryLabel[block.category]}`);
	}
	if (block.creditMax) parts.push(`Crédito alvo: até R$ ${block.creditMax.toLocaleString("pt-BR")}`);
	if (block.termMonthsPreferred) parts.push(`Prazo preferido: ${block.termMonthsPreferred} meses`);
	if (block.monthlyBudget) parts.push(`Orçamento mensal: R$ ${block.monthlyBudget.toLocaleString("pt-BR")}`);
	if (block.expertiseLevel) {
		parts.push(`Experiência com consórcio: ${block.expertiseLevel === "first" ? "primeiro consórcio" : "já participou antes"}`);
	}
	if (block.lastSimulation) {
		const date = formatDate(block.lastSimulation.date);
		parts.push(
			`Última simulação (${date}): R$ ${block.lastSimulation.creditValue.toLocaleString("pt-BR")} em ${block.lastSimulation.termMonths} meses, parcela R$ ${block.lastSimulation.monthlyPrice.toLocaleString("pt-BR")}`,
		);
	}
	if (block.lastRecommendation) {
		const date = formatDate(block.lastRecommendation.date);
		parts.push(`Última recomendação (${date}): ${block.lastRecommendation.label}`);
	}
	if (block.objections && block.objections.length > 0) {
		parts.push(`Objeções já levantadas: ${block.objections.join("; ")}`);
	}
	if (block.channels && block.channels.length > 0) {
		parts.push(`Canais usados: ${block.channels.join(", ")}`);
	}
	return parts.length > 0 ? parts.join("\n") : null;
}

/**
 * Hint específico de reativação. Retorna null se 0 dias (mesma sessão).
 */
export function buildReactivationHint(
	block: HumanMemoryBlock,
	daysSinceLastInteraction: number | null,
): string | null {
	if (daysSinceLastInteraction === null || daysSinceLastInteraction < 1) return null;

	const d = daysSinceLastInteraction;
	if (d < 2) {
		return `[REATIVAÇÃO] Usuário voltou após ${d} dia. Retome de onde parou — não recomece do zero.`;
	}
	if (d < 7) {
		const last = block.lastSimulation
			? `Última ação: simulou R$ ${block.lastSimulation.creditValue.toLocaleString("pt-BR")} em ${block.lastSimulation.termMonths} meses.`
			: block.lastRecommendation
				? `Última ação: recebeu recomendação "${block.lastRecommendation.label}".`
				: "Já tinha conversa em andamento.";
		return `[REATIVAÇÃO] Usuário voltou após ${d} dias. ${last} Pergunte se quer continuar onde parou ou se mudou algo.`;
	}
	// 8+ dias
	const summary = block.lastRecommendation?.label
		? `Recomendação anterior: ${block.lastRecommendation.label}.`
		: block.creditMax
			? `Buscava ${block.category ?? "consórcio"} de até R$ ${block.creditMax.toLocaleString("pt-BR")}.`
			: "";
	return `[REATIVAÇÃO LONGA] Usuário ausente por ${d} dias. ${summary} Recapture atenção com tom acolhedor. Pergunte o que mudou desde a última conversa antes de assumir que ainda quer o mesmo.`;
}

function formatDate(iso: string): string {
	try {
		const d = new Date(iso);
		return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
	} catch {
		return iso;
	}
}
