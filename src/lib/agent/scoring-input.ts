import type { ConversationMetadata } from "@/lib/agent/personas";
import type { ScoringInput } from "@/lib/agent/recommendation";

/** O que o cliente consegue juntar de lance: o dinheiro declarado mais o
 * embutido da carta recomendada (quando ele aceitou usar embutido). */
export function lanceDisponivelDoCliente(meta: ConversationMetadata): number | undefined {
	const q = meta.qualifyAnswers ?? {};
	const bolso = q.lanceValue ?? 0;
	const carta = meta.recommendedOffer?.creditValue ?? q.creditMax ?? 0;
	const embutido =
		q.lanceEmbutido === true && carta > 0 ? carta * ((q.lanceEmbutidoPercent ?? 30) / 100) : 0;
	const total = bolso + embutido;
	return total > 0 ? Math.round(total) : undefined;
}

export function scoringInputFromMeta(meta: ConversationMetadata): ScoringInput {
	const q = meta.qualifyAnswers ?? {};
	return {
		budget: q.monthlyBudget ?? 0,
		desiredTermMonths: q.prazoMeses ?? 0,
		creditMax: q.creditMax,
		hasLance: q.hasLance === "yes",
		// Bolso + embutido: é o lance que ele consegue POR NA MESA. Sem isso o
		// ranking recomendava o grupo cujo lance médio ele não tinha como disputar.
		lanceDisponivel: lanceDisponivelDoCliente(meta),
	};
}
