// COMPARAÇÃO DE PRAZO SÓ COM O NÚMERO DA MESA — invariante de FATO, não de tom.
//
// Defeito medido (print `prints-ux/13-seguir-ou-comparar-com-nome.png`, 27/10 22:35, ordem do
// líder): o agente disse *"Ela tem prazo mais curto que a de 94 meses da ÂNCORA"* sobre a carta de
// **96** meses. 96 é MAIS LONGO que 94. O cliente que confia na frase contrata o prazo errado, e o
// erro passa despercebido porque a fala soa plausível — é exatamente o caso em que o modelo troca
// um número com cara de acerto.
//
// O que este arquivo faz: lê a direção que a fala AFIRMA ("mais curto", "mais longo", "menor
// prazo", "maior prazo") e confere contra os prazos REAIS das cartas que estão na mesa. Se a
// direção estiver trocada, corrige a palavra; se o prazo citado não existir em carta nenhuma da
// mesa, o número é invenção e a comparação sai (a fala continua, sem o comparativo).
//
// Não é guarda de fala do agente (o `AGENTS.md` proíbe regex de tom, repetição e fluidez): é a
// mesma família do "número sem lastro" — comparação verificável contra o dado da ferramenta.
// Quem não tem lastro não vai à tela.

const PRAZO_CITADO = /(\d{2,3})\s*(?:meses|m[êe]s)\b/gi;
/** Prazo citado sem a unidade: "a de 94 tem…" — o cliente e o agente dizem assim o tempo todo.
 * Só vale quando vem depois de "de" e NÃO é dinheiro ("R$ 94 mil", "94 reais"). */
const PRAZO_SEM_UNIDADE = /\bde\s+(\d{2,3})(?!\s*(?:mil|reais|%|dias))/gi;

/** Comparativo: a direção que a fala AFIRMA sobre o prazo do sujeito em relação à referência. */
const MAIS_CURTO = /mais\s+curto|menor\s+(?:prazo|tempo)|prazo\s+menor/i;
const MAIS_LONGO = /mais\s+longo|maior\s+(?:prazo|tempo)|prazo\s+maior/i;

/** Uma frase por vez: o comparativo e os prazos citados vivem na MESMA frase. */
function frases(texto: string): string[] {
	return texto.split(/(?<=[.!?])\s+|\n+/).filter((f) => f.trim().length > 0);
}

/**
 * Corrige a comparação de prazo de um balão.
 *
 * `prazosDaMesa` — os prazos (meses) das cartas que o cliente está vendo.
 * `prazoDaRecomendada` — o prazo da carta que o agente está recomendando ("ela"), quando a frase
 * fala dela sem repetir o número.
 */
export function corrigirComparacaoDePrazo(
	texto: string,
	args: { prazosDaMesa: readonly number[]; prazoDaRecomendada?: number } = { prazosDaMesa: [] },
): string {
	if (!texto || (!MAIS_CURTO.test(texto) && !MAIS_LONGO.test(texto))) return texto;
	const mesa = new Set(args.prazosDaMesa.filter((n) => Number.isFinite(n) && n > 0));
	return frases(texto)
		.map((frase) => {
			const curto = MAIS_CURTO.test(frase);
			const longo = MAIS_LONGO.test(frase);
			if (!curto && !longo) return frase;

			const numeros = [
				...[...frase.matchAll(PRAZO_CITADO)].map((m) => ({ at: m.index ?? 0, n: Number(m[1]) })),
				...[...frase.matchAll(PRAZO_SEM_UNIDADE)].map((m) => ({
					at: (m.index ?? 0) + m[0].indexOf("de"),
					n: Number(m[1]),
				})),
			]
				.sort((a, b) => a.at - b.at)
				.map((x) => x.n);
			if (numeros.length === 0) return frase;

			const referencia = numeros.length > 1 ? numeros[numeros.length - 1] : numeros[0];
			const sujeito =
				numeros.length > 1 ? numeros[0] : (args.prazoDaRecomendada ?? undefined);

			// Prazo citado que não é de carta nenhuma da mesa: o número é invenção. A comparação
			// sai; o resto da frase fica.
			if (!mesa.has(referencia)) return semComparativo(frase);

			// Sem o prazo do sujeito não há como provar a direção: a comparação sai (não se afirma
			// o que não se pode conferir).
			if (sujeito === undefined || !mesa.has(sujeito)) return semComparativo(frase);

			const afirmaCurto = curto && !longo;
			const verdadeiroCurto = sujeito < referencia;
			if (afirmaCurto === verdadeiroCurto) return frase;

			// Direção trocada: a palavra certa é a outra.
			return curto
				? frase.replace(MAIS_CURTO, (m) => trocarSentido(m, "longo"))
				: frase.replace(MAIS_LONGO, (m) => trocarSentido(m, "curto"));
		})
		.join(" ");
}

function trocarSentido(achado: string, sentido: "curto" | "longo"): string {
	const minusculo = achado.toLowerCase();
	if (minusculo.includes("mais")) return `mais ${sentido}`;
	if (minusculo.includes("menor") || minusculo.includes("maior"))
		return sentido === "curto" ? "menor prazo" : "maior prazo";
	return `prazo ${sentido === "curto" ? "menor" : "maior"}`;
}

/** Tira o comparativo da frase, mantendo o fato que ela carrega. */
function semComparativo(frase: string): string {
	return frase
		.replace(/\s*,?\s*(?:com|de|que tem)?\s*(?:prazo|tempo)?\s*(?:mais\s+(?:curto|longo)|menor|maior)\s*(?:prazo|tempo)?\s*(?:que|do que|de)\s*(?:a\s+)?(?:de\s+)?\d{2,3}\s*(?:meses|m[êe]s)[^.!?]*/gi, "")
		.replace(/\s{2,}/g, " ")
		.trim();
}
