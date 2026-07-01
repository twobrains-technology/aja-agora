// FIX-102 — degeneração NÃO-determinística da LLM: a resposta inteira às vezes
// sai colada consigo mesma, ZERO separador ("Boa...!Boa...!"). Guarda
// determinística (decisão do card fix-102-assistant-texto-duplicado-eco.md):
// se o texto é EXATAMENTE 2 cópias idênticas coladas, colapsa pra 1. Heurística
// estreita de propósito — só pega auto-duplicação da string INTEIRA, nunca
// repetição curta legítima (ênfase) nem metades meramente parecidas.
export function collapseSelfDuplicatedText(text: string): string {
	const len = text.length;
	if (len === 0 || len % 2 !== 0) return text;
	const half = len / 2;
	const first = text.slice(0, half);
	const second = text.slice(half);
	return first === second ? first : text;
}
