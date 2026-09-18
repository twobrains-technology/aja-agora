/**
 * O rótulo LEGÍVEL de uma campanha que o gerenciador ainda não espelhou.
 *
 * ## O que estava acontecendo
 *
 * A tela de Campanhas mostrava, como texto principal, a chave crua que chegou no
 * `utm_campaign` — e uma delas era
 * `BOFU+-+AJA+%7C+CPM+FOCO+CONVERS%C3%83O+%2B+BASE+GERAL+%E2%80%94+C%C3%B3pia`.
 * Isso não é o nome da campanha: é o nome URL-encoded, com `+` no lugar de
 * espaço e percent-encoding no resto. Quem lê não reconhece a campanha, e o
 * painel parece apontar para outra conta.
 *
 * ## O que este módulo faz — e o que ele NÃO faz
 *
 * Faz **só apresentação**: devolve um texto humano para exibir. Não resolve a
 * causa (o de-para oficial continua sendo o espelho da Meta, que traz o nome
 * real) e não toca em identidade:
 *
 * - `linha.chave`, o `?campanha=` da URL, o `title` e a busca continuam com o
 *   valor CRU. `titulo-da-origem.ts` avisa desde sempre: o rótulo cru é a chave
 *   de busca e de filtro, e quem cola o `utm_campaign` no gerenciador precisa
 *   dele inteiro.
 * - **Não há de-para por proximidade de nome.** Duas campanhas diferentes podem
 *   decodificar para o mesmo texto; aproximar uma da outra seria inventar
 *   vínculo. Decodificar é o paliativo honesto; o nome oficial vem do sync.
 *
 * ## A ordem das operações é a correção
 *
 * `+` vira espaço ANTES do `decodeURIComponent`, não depois. Em
 * `application/x-www-form-urlencoded` o `+` é espaço — mas o `%2B` da mesma
 * string é um `+` literal que o anunciante digitou. Decodificando primeiro, o
 * `%2B` viraria `+` e depois seria confundido com espaço ("BASE GERAL + CÓPIA"
 * viraria "BASE GERAL   CÓPIA"). Na ordem certa, só o `+` de verdade vira
 * espaço.
 */

/**
 * Decodifica a chave de campanha para leitura, tolerando percent-encoding
 * inválido.
 *
 * Tolerante de propósito: `decodeURIComponent` lança `URIError` em `%` solto
 * (por exemplo "CAMPANHA 100% NOVA"), e uma tela não pode quebrar por causa
 * disso. Quando o decode falha, o texto volta como veio (só com `+` → espaço e
 * espaços colapsados) — feio é melhor que erro, e o cru continua inteiro no
 * `title`.
 */
export function decodificarChaveDeCampanha(chave: string): string {
	const comEspacos = chave.replace(/\+/g, " ");
	let decodificada: string;
	try {
		decodificada = decodeURIComponent(comEspacos);
	} catch {
		decodificada = comEspacos;
	}
	// Colapsa espaços repetidos: a URL costuma trazer `+` onde havia espaço, e a
	// combinação com espaço literal criaria buracos na leitura.
	return decodificada.replace(/\s+/g, " ").trim();
}

/**
 * A chave é só o id numérico da Meta — sem nome nenhum para decodificar.
 *
 * Existe para a tela distinguir "campanha nova, o gerenciador ainda não
 * espelhou" (id puro) de "campanha que veio por UTM com nome digitado"
 * (decodifica o texto). A primeira não tem o que mostrar além de um aviso; a
 * segunda tem o nome do anunciante, que é informação.
 */
export function ehIdNumerico(chave: string): boolean {
	return /^\d+$/.test(chave.trim());
}
