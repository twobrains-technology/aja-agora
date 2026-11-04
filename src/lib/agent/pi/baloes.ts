// A CONVERSA PICADA — o texto do beat vira BOLHAS curtas, como gente digita no chat.
//
// Ordem do dono, 27/10/2026: *"que ele fale de forma mais humanizada, com conversa picada, no
// sentido igual um humano fala no chat"*. O defeito medido nos prints 07 e 08
// (`.orientacao/prints-ux/`): o modelo devolvia o beat inteiro — 7 a 9 linhas, com `**Lance
// livre:**` e `**Lance embutido:**` dentro — e `soltarTrecho` jogava tudo num balão só. No canal
// web isso é um bloco de texto; no WhatsApp, uma mensagem gigante. Quebrar em bolhas no fim
// (aqui) e não no modelo é o que garante o resultado com qualquer provedor: o texto do beat é
// dividido em fronteiras de FRASE, cada pedaço sai com a sua fronteira e o cliente lê três
// bolhas curtas em sequência.
//
// As regras, em ordem:
//  · texto curto (até `maxChars`) volta como UM balão — bolha picada em texto curto é pior;
//  · uma frase só não é picada: não existe fronteira de frase para respeitar;
//  · frases são separadas em `. `, `? `, `! ` e quebra de linha dupla, e só ali: número
//    (`R$ 1.176,39`) e abreviação comum (`Sr.`, `etc.`) nunca são fim de frase;
//  · no máximo `maxBaloes` (3) balões, e o último recebe o resto — NADA se perde;
//  · o teto por balão é o menor que ainda cabe em `maxBaloes`, isto é, os balões saem
//    equilibrados. Encher um a um até `maxChars` e despejar o resto no terceiro devolveria um
//    terceiro balão de 300 caracteres — o textão que o dono reclamou, só que no fim.

/** O teto de um balão de conversa: duas linhas curtas no celular. */
const MAX_CHARS = 140;

/** Um turno com mais de três bolhas seguidas já é o parágrafo de volta. */
const MAX_BALOES = 3;

/** Abreviações comuns: o ponto delas não fecha frase ("Sr. Silva", "etc. e tal"). */
const ABREVIACOES = new Set([
	"sr",
	"sra",
	"srs",
	"sras",
	"dr",
	"dra",
	"prof",
	"profa",
	"ex",
	"etc",
	"obs",
	"pag",
	"pág",
	"vs",
	"op",
	"cit",
	"qto",
]);

/** O ponto em `pos` é de abreviação (ou de inicial de nome, "J. Silva")? */
function ehPontoDeAbreviacao(texto: string, pos: number): boolean {
	const antes = texto.slice(0, pos + 1);
	const palavra = /([\p{L}\p{N}]+)\.$/u.exec(antes)?.[1] ?? "";
	// Uma letra sozinha antes do ponto é inicial de nome, não fim de frase.
	if (palavra.length === 1) return true;
	return ABREVIACOES.has(palavra.toLowerCase());
}

/** O texto em frases, cada uma com a sua pontuação. Nenhum caractere é descartado: o que sai
 * daqui, junto, é o texto que entrou. */
function frasesDe(texto: string): string[] {
	const frases: string[] = [];
	let inicio = 0;
	for (let i = 0; i < texto.length; i++) {
		const c = texto[i];
		if (c === "\n" && texto[i + 1] === "\n") {
			frases.push(texto.slice(inicio, i));
			while (texto[i + 1] === "\n") i++;
			inicio = i + 1;
			continue;
		}
		if (c !== "." && c !== "!" && c !== "?") continue;
		const depois = texto[i + 1];
		if (depois !== undefined && !/\s/.test(depois)) continue;
		if (c === "." && ehPontoDeAbreviacao(texto, i)) continue;
		frases.push(texto.slice(inicio, i + 1));
		inicio = i + 1;
	}
	frases.push(texto.slice(inicio));
	return frases.map((f) => f.trim()).filter((f) => f.length > 0);
}

/** Junta as frases na ordem, em balões de até `teto` caracteres. Uma frase maior que o teto
 * fica sozinha no balão dela: picar no meio de uma frase é o que este arquivo evita. */
function empacotar(frases: readonly string[], teto: number): string[] {
	const baloes: string[] = [];
	let atual = "";
	for (const frase of frases) {
		if (!atual) {
			atual = frase;
			continue;
		}
		if (atual.length + 1 + frase.length <= teto) {
			atual = `${atual} ${frase}`;
			continue;
		}
		baloes.push(atual);
		atual = frase;
	}
	if (atual) baloes.push(atual);
	return baloes;
}

/**
 * O texto do beat em balões de conversa, na ordem. Devolve `[]` para texto vazio e um balão só
 * para texto curto, para uma frase só ou quando `maxBaloes` é 1.
 *
 * Cada balão vem aparado (sem espaço nas pontas): quem junta os pedaços de volta tem o texto
 * inteiro, só os espaços entre os balões que deixam de existir.
 */
export function picarEmBaloes(
	texto: string,
	opts: { maxBaloes?: number; maxChars?: number } = {},
): string[] {
	const maxBaloes = Math.max(1, Math.floor(opts.maxBaloes ?? MAX_BALOES));
	const maxChars = Math.max(1, Math.floor(opts.maxChars ?? MAX_CHARS));
	const limpo = texto.trim();
	if (!limpo) return [];
	if (limpo.length <= maxChars || maxBaloes === 1) return [limpo];
	const frases = frasesDe(limpo);
	if (frases.length < 2) return [limpo];

	// O menor teto com que as frases ainda cabem em `maxBaloes` balões: é o que equilibra os
	// pedaços em vez de deixar o último com o resto. `limpo.length` sempre cabe em 1 balão, então
	// a busca termina no pior caso com o texto inteiro numa bolha.
	let baixo = maxChars;
	let alto = limpo.length;
	while (baixo < alto) {
		const meio = Math.floor((baixo + alto) / 2);
		if (empacotar(frases, meio).length <= maxBaloes) alto = meio;
		else baixo = meio + 1;
	}
	return empacotar(frases, baixo);
}
