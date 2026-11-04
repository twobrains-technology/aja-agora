// Detector anti-promessa de contemplação (D-0056, Q4). Mais largo que
// promessaDeContemplacao de whatsapp-template.ts (que fica intacto).
// Regex não prova ausência de paráfrase: é a primeira barreira, não a única.
import type { ResultadoDoDetector } from "./tipos";

const MESES =
	"janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro";

const PADROES: { re: RegExp; motivo: string }[] = [
	{
		re: /contempla[cç][aã]o\s+garantid[ao]|garantid[ao]\s+(?:a\s+)?contempla[cç][aã]o/i,
		motivo: "Promete contemplação garantida. A contemplação nunca é garantida.",
	},
	{
		re: /garantia\s+de\s+contempla[cç][aã]o/i,
		motivo: "Fala em garantia de contemplação. Não existe garantia.",
	},
	{
		re: /\bgarant\w*\b[^.!?\n]{0,40}\bcontempla\w*/i,
		motivo: "Garante a contemplação. O agente não pode garantir resultado de sorteio ou lance.",
	},
	{
		re: /\bcontempla\w*\b[^.!?\n]{0,40}\bgarant(?:id|o|e|a)\w*/i,
		motivo: "Garante a contemplação. O agente não pode garantir resultado de sorteio ou lance.",
	},
	{
		// Ordem negada ("nunca prometa data de contemplação") é a proteção, não a promessa.
		re: /(?<!\b(?:nunca|jamais|n[aã]o|sem)\s)\bprometa\w*\b[^.!?\n]{0,40}\bcontempla\w*/i,
		motivo: "Manda prometer contemplação. Promessa de resultado é proibida.",
	},
	{
		re: /\b(?:vai|v[aã]o|ser[aá]|ser[aã]o|vais)(?:\s+ser)?\s+contemplad[oa]s?\b/i,
		motivo: "Afirma que o cliente será contemplado. Contemplação não é certa.",
	},
	{
		re: /contemplad[oa]s?\s+(?:certamente|com\s+certeza|sem\s+falta|na\s+certa)/i,
		motivo: "Afirma contemplação com certeza.",
	},
	{
		re: new RegExp(
			`contempla[cç][aã]o\\s+(?:sai|ocorre|acontece|[eé]|ser[aá])?\\s*(?:em|no\\s+m[eê]s\\s+de|at[eé])\\s+(?:\\d+\\s*(?:dias?|meses|m[eê]s|semanas?)|${MESES})`,
			"i",
		),
		motivo: "Crava data ou prazo de contemplação. Não há como prometer o mês.",
	},
];

export function detectarPromessaDeContemplacao(texto: string): ResultadoDoDetector {
	for (const { re, motivo } of PADROES) {
		if (re.test(texto)) return { ok: false, motivo };
	}
	return { ok: true };
}
