// NÚMEROS FALADOS — a mecânica de leitura de número em texto, compartilhada.
//
// Extraída de `src/lib/eval/signals.ts` para o detector `numero_fora_da_cota`
// (bloco B4) usar a MESMA régua que os sinais da conversa já usam: um número
// fora da cota no turno tem de ser o mesmo "fora" que o detector da conversa
// marcaria — senão os dois instrumentos medem coisas diferentes.
//
// Puros: sem estado, sem I/O. Quem decide o que é FONTE (artefatos, tools,
// fala do cliente) é o chamador.
import { extractMoneyMentions } from "@/lib/agent/orchestrator/money";

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

/**
 * Faixa de valor falada: "entre 50 e 100 mil", "50 a 100 mil", "de 50 até 100
 * milhões". A escala pertence AO PAR — os dois ponteiros herdam o sufixo, e o
 * ponteiro solto ("50") sem a escala é metade da fala do cliente. Medido na
 * rodada de 05/11/2026 (`golden-real-remarketing-identico` turno 1): o lead
 * disse "carro entre 50 e 100 mil", o agente ecoou "entre R$ 50 e R$ 100 mil",
 * e o lastro só tinha 100.000 — o "R$ 50" do eco acusou SEM LASTRO.
 */
const FAIXA_REGEX =
	/(\d+(?:\.\d+)?)\s*(?:ate|até|a|e)\s*(\d+(?:\.\d+)?)\s*(mil|milh[õo]es|milh[ãa]o)\b/gi;

/** Escala escrita por extenso → fator. Mesma régua de `money.ts`, local para
 * não puxar o orchestrador. */
function fatorDaEscala(escala: string): number {
	const seca = escala
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (seca.startsWith("milh")) return 1_000_000;
	if (seca === "mil") return 1_000;
	return 1;
}

/** Ponteiros X*escala e Y*escala de cada faixa "X e Y mil" no texto. */
export function faixasFaladas(texto: string): number[] {
	const valores: number[] = [];
	for (const m of texto.matchAll(FAIXA_REGEX)) {
		const fator = fatorDaEscala(m[3]);
		for (const bruto of [m[1], m[2]]) {
			const n = Number(bruto.replace(/\./g, "").replace(",", "."));
			if (Number.isFinite(n)) valores.push(n * fator);
		}
	}
	return valores;
}

/** Unidade a até DUAS palavras curtas do número: "1200 por mês", "500 reais por
 * mês", "100 mil de parcela". O `NUMBER_REGEX` exige adjacência; a fala real
 * intercala. Usada SÓ no LASTRO — o que o cliente falou é fonte onde quer que
 * o par (valor, unidade) apareça, adjacente ou não. */
const UNIDADE_NAO_ADJACENTE =
	/\b(\d+(?:[.,]\d+)?)\s+(?:[a-zà-ú]{1,8}\s+){0,2}(m[eê]s(?:es)?|anos?|parcelas?|mil|milh[õo]es|milh[ãa]o)\b/gi;

/** Todo número que a fala do usuário pôs na mesa — a fonte de lastro. Une a
 * leitura monetária (`extractMoneyMentions`), o `NUMBER_REGEX` com escala, os
 * ponteiros de faixa e o par (valor, unidade) não adjacente. */
export function lastroDaFala(texto: string): number[] {
	const valores = new Set<number>(faixasFaladas(texto));
	for (const m of texto.matchAll(NUMBER_REGEX)) {
		const n = parseNumeric(m[0]);
		if (n !== null) valores.add(n);
	}
	for (const m of texto.matchAll(UNIDADE_NAO_ADJACENTE)) {
		const n = Number(m[1].replace(/\./g, "").replace(",", "."));
		if (Number.isFinite(n)) valores.add(n * fatorDaEscala(m[2]));
	}
	return [...valores];
}

/**
 * Valores monetários que o AGENTE falou, com a faixa resolvida: em
 * "entre R$ 50 e R$ 100 mil" o "R$ 50" é cinquenta MIL — a escala do segundo
 * ponteiro pertence ao par, e ler "R$ 50" solto transformava o eco do cliente
 * em acusação de número inventado (mesma rodada de 05/11/2026).
 */
const PAR_DE_ESCALA =
	/R\$\s*([\d.,]+)\s*(?:ate|até|a|e)\s*R\$\s*([\d.,]+)\s*(mil|milh[õo]es|milh[ãa]o)\b/gi;

export function valoresFalados(texto: string): number[] {
	const valores: number[] = [];
	let restante = texto;
	restante = restante.replace(PAR_DE_ESCALA, (_m, x: string, y: string, escala: string) => {
		const fator = fatorDaEscala(escala);
		for (const bruto of [x, y]) {
			const n = Number(bruto.replace(/\./g, "").replace(",", "."));
			if (Number.isFinite(n)) valores.push(n * fator);
		}
		return "";
	});
	valores.push(...extractMoneyMentions(restante));
	return valores;
}

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
