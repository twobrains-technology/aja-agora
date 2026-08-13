// Extração de valores monetários em pt-BR — PURO, sem dependência de domínio.
//
// Vivia dentro de `choose-offer.ts` como função privada. Saiu daqui porque os
// asserts do golden-set (`src/lib/eval/golden-asserts.ts`) precisam da MESMA
// leitura de dinheiro pra checar se um número que o agente falou tem lastro —
// e duplicar a regex significaria duas noções de "o que é um valor" divergindo
// com o tempo. Módulo puro pra que o runner do eval não puxe o orchestrator.

/** "1.234,56" / "1.234" / "1234,56" → número. `null` quando não é número. */
export function parsePtBrNumber(raw: string): number | null {
	const cleaned = raw.trim();
	const normalized = cleaned.includes(",")
		? cleaned.replace(/\./g, "").replace(",", ".")
		: cleaned.replace(/\./g, "");
	const n = Number(normalized);
	return Number.isNaN(n) ? null : n;
}

/** Fator da escala escrita por extenso ("mil", "milhão", "mi"). 1 = sem escala. */
function fatorDaEscala(palavra: string | undefined): number {
	if (!palavra) return 1;
	// Sem acento e minúsculo: "milhão", "milhao", "MILHÕES" viram a mesma coisa.
	const seca = palavra
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
	if (seca === "mil") return 1_000;
	// "milhao"/"milhoes" (já sem acento) e o coloquial "mi".
	if (seca === "mi" || seca.startsWith("milh")) return 1_000_000;
	return 1;
}

const ESCALA_ESCRITA = "mil|milh[õo]es|milh[ãa]o|mi";

/** Todos os valores monetários citados no texto: "19 mil", "R$ 6.252", "1.000.000".
 *
 * A escala escrita GANHA do número cru: "R$ 93 mil" são noventa e três mil, e
 * não noventa e três. A regra do `R$` capturava o número ignorando o "mil" que
 * vinha depois, e o valor espúrio virava acusação falsa de número inventado
 * contra o agente (gate de 2026-08-13: ele disse "quase R$ 93 mil" sobre uma
 * carta de R$ 92.902 — arredondamento honesto, reprovado como invenção). */
export function extractMoneyMentions(text: string): number[] {
	const out: number[] = [];
	const comEscala = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${ESCALA_ESCRITA})\\b`, "gi");
	for (const m of text.matchAll(comEscala)) {
		const base = Number(m[1].replace(",", "."));
		if (!Number.isNaN(base)) out.push(base * fatorDaEscala(m[2]));
	}
	// O `R$` só conta quando o número NÃO é seguido de escala — senão o mesmo
	// valor entraria duas vezes, uma delas mil vezes menor.
	const soCifrao = new RegExp(
		`R\\$\\s*([\\d.,]+)(?!\\s*(?:${ESCALA_ESCRITA})\\b)(?![\\d.,])`,
		"gi",
	);
	for (const m of text.matchAll(soCifrao)) {
		const n = parsePtBrNumber(m[1]);
		if (n !== null) out.push(n);
	}
	for (const m of text.matchAll(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g)) {
		const n = parsePtBrNumber(m[0]);
		if (n !== null) out.push(n);
	}
	return out;
}
