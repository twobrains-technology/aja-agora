// A mesma oferta não aparece duas vezes na mesma tela.
//
// Report do Kairo, 05/08/2026: "Está repetindo grupos iguais". O payload do
// `comparison_table` é escrito pelo MODELO (é o input da tool de apresentação),
// e ele às vezes lista o mesmo grupo duas vezes — em geral quando o cliente
// pede "quero ver mais opções" e ele remonta a lista somando a que já estava
// destacada. Do lado do cliente é a mesma carta, a mesma parcela e o mesmo
// prazo repetidos na tabela: parece erro de sistema, e é.
//
// Isto é invariante, não conversa: duas linhas idênticas na mesma tabela não
// podem existir, independente do que o modelo escreveu. Por isso vive em
// código, no caminho de emissão, e não numa regra de prompt (que já existia e
// não segurou — a tabela duplicada chegou à tela mesmo assim).
//
// O que NÃO é duplicata: a mesma administradora com números diferentes (são
// grupos distintos, e mostrar dois grupos do Itaú é legítimo), e a oferta
// destacada no `recommendation_card` reaparecendo na tabela — esse é o desenho
// (FIX-78/FIX-224: card de destaque + tabela com todas).

type Oferta = Record<string, unknown>;

/** Identidade de uma oferta NA TELA: quem oferta e os três números que o
 *  cliente lê. Grupo diferente muda pelo menos um deles. */
function identidade(o: Oferta): string {
	const n = (k: string) => {
		const v = o[k];
		return typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
	};
	return [n("administradora"), n("creditValue"), n("monthlyPayment"), n("termMonths")].join("::");
}

/** Remove repetições preservando a ORDEM (a primeira ocorrência vence — é a que
 *  o modelo escolheu mostrar primeiro, e a ordem da tabela é significativa). */
export function semOfertasRepetidas<T extends Oferta>(ofertas: readonly T[]): T[] {
	const vistas = new Set<string>();
	const saida: T[] = [];
	for (const o of ofertas) {
		const chave = identidade(o);
		if (vistas.has(chave)) continue;
		vistas.add(chave);
		saida.push(o);
	}
	return saida;
}

/**
 * Aplica a regra ao payload de um card de apresentação, se ele tiver lista.
 *
 * Devolve o MESMO objeto quando não há nada a fazer — assim o caminho comum não
 * paga cópia nem muda identidade de referência.
 */
export function payloadSemOfertasRepetidas<T>(payload: T): T {
	if (!payload || typeof payload !== "object") return payload;
	const p = payload as { groups?: unknown };
	if (!Array.isArray(p.groups)) return payload;
	const limpos = semOfertasRepetidas(p.groups as Oferta[]);
	if (limpos.length === p.groups.length) return payload;
	return { ...(payload as object), groups: limpos } as T;
}
