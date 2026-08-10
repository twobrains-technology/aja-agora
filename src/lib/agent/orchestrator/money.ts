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

/** Todos os valores monetários citados no texto: "19 mil", "R$ 6.252", "1.000.000". */
export function extractMoneyMentions(text: string): number[] {
	const out: number[] = [];
	for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*mil\b/gi)) {
		const n = Number(m[1].replace(",", "."));
		if (!Number.isNaN(n)) out.push(n * 1000);
	}
	for (const m of text.matchAll(/R\$\s*([\d.,]+)/gi)) {
		const n = parsePtBrNumber(m[1]);
		if (n !== null) out.push(n);
	}
	for (const m of text.matchAll(/\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b/g)) {
		const n = parsePtBrNumber(m[0]);
		if (n !== null) out.push(n);
	}
	return out;
}
