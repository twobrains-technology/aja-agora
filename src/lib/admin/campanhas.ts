/**
 * A LISTA de campanhas de um filtro — o contrato de `?campanha=a,b,c`.
 *
 * O filtro de campanha nasceu de valor único (`?campanha=camp-1`) e o painel
 * sabe filtrar por mais de uma agora. Esta é a fronteira onde a forma de ENTRADA
 * (a string da querystring, ou um array que o nuqs já separou) vira sempre a
 * mesma lista limpa — um lugar só, para o SQL e o componente não divergirem.
 *
 * ── A regra que este módulo existe para deixar impossível ───────────────────
 *
 * **Lista vazia é "sem filtro", nunca "filtro que não casa nada".** O
 * `inArray` do Drizzle devolve `false` para lista vazia: se a lista crua
 * chegasse até lá, `?campanha=` (ou a URL sem campanha) esconderia TODAS as
 * conversas, parecendo "nenhuma veio daqui" quando a verdade é "não pedi
 * recorte". É o erro clássico deste tipo de mudança, e por isso a normalização
 * vem antes, não depois.
 *
 * Módulo PURO: sem React, sem banco, sem SQL. Roda no servidor (a rota monta o
 * predicado) e no navegador (o componente lê a URL).
 */

/**
 * O que um filtro de campanha aceita na entrada.
 *
 * A string pode ser um valor só (`camp-1`) ou a lista da querystring
 * (`camp-1,camp-2`) — é assim que ela chega tanto pelo nuqs quanto por
 * `request.nextUrl.searchParams.get("campanha")`. A vírgula é o separador
 * combinado na URL; campanha com vírgula no nome não existe na prática (é
 * texto de UTM) e não é suportada de propósito.
 */
export type Campanhas = string | readonly string[] | null | undefined;

/** A lista limpa: sem espaços, sem vazios, sem repetição, na ordem de entrada. */
export function normalizarCampanhas(entrada: Campanhas): string[] {
	if (entrada == null) return [];

	const bruto: readonly string[] = typeof entrada === "string" ? entrada.split(",") : entrada;
	const vistas = new Set<string>();
	for (const item of bruto) {
		const valor = item?.trim();
		if (valor) vistas.add(valor);
	}
	return [...vistas];
}

/** `true` quando não há recorte de campanha — a lista vazia que vira "não filtrar". */
export function semCampanhas(entrada: Campanhas): boolean {
	return normalizarCampanhas(entrada).length === 0;
}

/**
 * O valor que vai para a URL: `camp-1,camp-2`, ou `null` quando não há recorte.
 *
 * `null` (e não `""`) é o que o nuqs usa para REMOVER o parâmetro — e é o mesmo
 * contrato de `predicadoDeOrigemNaVisita`, que devolve `null` para "não
 * filtrar".
 */
export function campanhasParaParametro(entrada: Campanhas): string | null {
	const lista = normalizarCampanhas(entrada);
	return lista.length > 0 ? lista.join(",") : null;
}
