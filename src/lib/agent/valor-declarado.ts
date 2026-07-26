// FIX-378 — ancoragem do valor declarado pelo cliente.
//
// "Invariante verificável vira código" (CLAUDE.md). Este é verificável: o
// número que o cliente escreveu está no texto; o que o extrator gravou está no
// estado. Se o segundo não sai do primeiro, alguém inventou.
//
// Ao vivo: o cliente escreveu "100 reais", insistiu ("foi 100 reais mesmo") e o
// estado guardou R$ 1.000,00 — dez vezes o que ele falou. Esse valor virou
// `creditMax` e disparou a corrente do FIX-377 (faixa abaixo do piso → busca
// vazia → loop de "vou pesquisar agora"). O guard existe pra cortar na origem.
//
// A regra NÃO julga intenção. Se o cliente diz um valor que parece baixo demais
// pra um carro, o agente pode e deve comentar isso em português — o que ele não
// pode é REGISTRAR outro número. Errar pra menos devolve uma pergunta, que é
// barato; errar pra mais vende diferente do combinado. Mesma assimetria do
// guard de lance × crédito (analyze.ts).

/** Multiplicadores de escala escritos do jeito que as pessoas falam. */
const ESCALAS: Array<{ re: RegExp; fator: number }> = [
	{ re: /^(mil|k)$/i, fator: 1_000 },
	{ re: /^(milh[õo]es?|mi|kk)$/i, fator: 1_000_000 },
];

/** Números presentes no texto, já expandidos pela escala que os acompanha. */
function valoresPlausiveis(texto: string): number[] {
	const encontrados: number[] = [];
	// Captura "180.339", "1.200,50", "90", e a palavra de escala logo depois
	// (com ou sem espaço: "90 mil" e "90mil").
	const re = /(\d[\d.,]*)\s*([a-zA-ZçÇõÕ]+)?/g;
	for (const m of texto.matchAll(re)) {
		const base = paraNumero(m[1]);
		if (base === null) continue;
		encontrados.push(base);
		const sufixo = m[2];
		if (!sufixo) continue;
		for (const { re: reEscala, fator } of ESCALAS) {
			if (reEscala.test(sufixo)) encontrados.push(base * fator);
		}
	}
	return encontrados;
}

/** "180.339" → 180339 · "1.200,50" → 1200.5 · "1,5" → 1.5 */
function paraNumero(bruto: string): number | null {
	const limpo = bruto.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
	const n = Number(limpo);
	return Number.isFinite(n) ? n : null;
}

/**
 * O valor extraído é derivável do que o cliente escreveu?
 *
 * `true` quando o texto NÃO traz número nenhum — o valor pode ter vindo do
 * slider (`value_picker`), de um card ou de um turno anterior, e bloquear aí
 * quebraria fluxo legítimo. O guard só pega CONTRADIÇÃO entre o dito e o
 * gravado, nunca ausência de menção.
 */
export function valorAncoradoNoTexto(texto: string, valorExtraido: number): boolean {
	const candidatos = valoresPlausiveis(texto ?? "");
	if (candidatos.length === 0) return true;
	return candidatos.some((c) => Math.abs(c - valorExtraido) < 0.01);
}
