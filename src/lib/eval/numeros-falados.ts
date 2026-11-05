// NÚMEROS FALADOS — a mecânica de leitura de número em texto, compartilhada.
//
// Extraída de `src/lib/eval/signals.ts` para o detector `numero_fora_da_cota`
// (bloco B4) usar a MESMA régua que os sinais da conversa já usam: um número
// fora da cota no turno tem de ser o mesmo "fora" que o detector da conversa
// marcaria — senão os dois instrumentos medem coisas diferentes.
//
// Puros: sem estado, sem I/O. Quem decide o que é FONTE (artefatos, tools,
// fala do cliente) é o chamador.

/**
 * R$, %, e número + unidade temporal/parcela. Unidade necessária pra evitar
 * matchar anos calendário ("em 2026") e quantidades genéricas no texto.
 * A ESCALA FAZ PARTE DO NÚMERO. "R$ 500 mil" dito pelo agente é o mesmo
 * 500.000 que está no card — e, sem capturar o sufixo, o detector lia
 * "R$ 500", não achava em artefato nenhum e marcava alucinação. Medido na
 * conversa real de 19/08/2026: era o último falso positivo que sobrava depois
 * do arredondamento.
 */
export const NUMBER_REGEX =
	/R\$\s*[\d.]+(?:,\d{1,2})?(?:\s*(?:milh[õo]es|milh[ãa]o|mil))?|\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*(?:m[eê]s(?:es)?|anos?|parcelas?)\b/gi;

/** Converte a captura do `NUMBER_REGEX` em número com a escala aplicada. */
export function parseNumeric(raw: string): number | null {
	// "mil"/"milhão" multiplicam o que vem antes — ignorar isso transforma meio
	// milhão em quinhentos reais.
	const escala = /\bmilh[õo]es|\bmilh[ãa]o/i.test(raw)
		? 1_000_000
		: /\bmil\b/i.test(raw)
			? 1_000
			: 1;
	const cleaned = raw
		.replace(/R\$\s*/i, "")
		.replace(/\s*%/, "")
		.replace(/\s*(?:milh[õo]es|milh[ãa]o|mil)\s*$/i, "")
		.replace(/\s*(?:m[eê]s(?:es)?|anos?|parcelas?)\s*$/i, "")
		.replace(/\./g, "")
		.replace(",", ".");
	const n = Number(cleaned);
	return Number.isFinite(n) ? n * escala : null;
}

/** Tolerância de ±1 unidade pra arredondamento de centavos. */
export function matchesKnownNumber(value: number, known: Set<number>): boolean {
	if (known.has(value)) return true;
	const rounded = Math.round(value);
	if (known.has(rounded)) return true;
	if (known.has(rounded + 1) || known.has(rounded - 1)) return true;
	return false;
}
