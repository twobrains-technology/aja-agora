// Runtime filter de few-shot examples por contexto do turno.
//
// Cada PersonaExample carrega condições opcionais `when*` (expertise, categoria,
// canal, intent). Esta função filtra os ativos cujas condições casam com o
// contexto atual, ranqueia por especificidade (mais condições casadas = mais
// relevante) e devolve até `limit` exemplos.
//
// Decisões:
// - Exemplo SEM condições é universal (score 0) — sempre considerado, mas
//   perde no rank pra exemplos mais específicos.
// - Exemplo COM condição precisa ter o valor do contexto no array. Se o
//   contexto não tem aquela dimensão definida (undefined), o exemplo
//   condicionado nessa dimensão NÃO casa (strict). Evita aplicar exemplo
//   "pra leigo" quando o expertise é desconhecido.
// - `enabled === false` filtra fora antes de qualquer outra checagem.
// - Ordenação estável: empates respeitam a ordem original do array, dando
//   ao admin controle determinístico.

import type { PersonaExample } from "@/db/schema";
import type { Category, ExpertiseLevel } from "./personas";
import type { UserIntent } from "./qualify-state";

export type ExampleContext = {
	expertise?: ExpertiseLevel;
	category?: Category;
	channel?: "web" | "whatsapp";
	intent?: UserIntent;
};

export const DEFAULT_EXAMPLE_LIMIT = 5;

type ScoredExample = {
	example: PersonaExample;
	score: number;
	originalIndex: number;
};

export function selectExamplesForTurn(
	examples: ReadonlyArray<PersonaExample>,
	context: ExampleContext,
	limit: number = DEFAULT_EXAMPLE_LIMIT,
): PersonaExample[] {
	const scored: ScoredExample[] = [];

	for (let i = 0; i < examples.length; i++) {
		const ex = examples[i];
		if (ex.enabled === false) continue;

		const score = matchScore(ex, context);
		if (score === null) continue; // Alguma condição falhou.

		scored.push({ example: ex, score, originalIndex: i });
	}

	// Mais condições casadas vence; empate respeita ordem original (estável).
	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.originalIndex - b.originalIndex;
	});

	return scored.slice(0, limit).map((s) => s.example);
}

// Retorna número de condições casadas, ou null se alguma condição explicitamente falhou.
function matchScore(ex: PersonaExample, ctx: ExampleContext): number | null {
	let score = 0;

	if (ex.whenExpertise && ex.whenExpertise.length > 0) {
		if (!ctx.expertise || !ex.whenExpertise.includes(ctx.expertise)) return null;
		score++;
	}

	if (ex.whenCategory && ex.whenCategory.length > 0) {
		if (!ctx.category || !ex.whenCategory.includes(ctx.category)) return null;
		score++;
	}

	if (ex.whenChannel) {
		if (!ctx.channel || ex.whenChannel !== ctx.channel) return null;
		score++;
	}

	if (ex.whenIntent && ex.whenIntent.length > 0) {
		if (!ctx.intent || !ex.whenIntent.includes(ctx.intent)) return null;
		score++;
	}

	return score;
}
