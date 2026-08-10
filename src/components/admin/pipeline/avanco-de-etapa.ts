/**
 * As etapas para onde um card pode AVANÇAR a partir de onde está.
 *
 * `raiasVisiveis` vem do servidor (a resposta de `/api/admin/leads`), então esta
 * função não decide permissão — ela só traduz "o que esta pessoa enxerga" em "o
 * que dá pra oferecer como próximo passo". Quem autoriza de verdade é o PATCH,
 * que revalida contra a raia real no banco.
 *
 * Só pra frente, sempre: o funil é forward-only e um botão que oferece voltar
 * levaria o operador direto num 403.
 */
export function destinosDeAvanco(raiasVisiveis: readonly string[], atual: string): string[] {
	const i = raiasVisiveis.indexOf(atual);
	if (i === -1) return [];
	// O BOTÃO continua sugerindo só o passo seguinte — é o caminho previsível de
	// quem está tocando o caso. Voltar etapa é possível (o funil deixou de ser
	// forward-only), mas por arrasto: seria ruído oferecer "voltar" num botão que
	// existe pra empurrar a venda adiante.
	//
	// `perdido` fica fora da fila: é saída lateral e, por ser o último da ordem
	// do funil, entraria aqui como "próximo passo" de Ganho.
	return raiasVisiveis.slice(i + 1).filter((r) => r !== PERDIDO);
}

const PERDIDO = "perdido";

/** Pode marcar perdido daqui? Vale de qualquer raia viva do escopo. */
export function podeMarcarPerdido(raiasVisiveis: readonly string[], atual: string): boolean {
	return raiasVisiveis.includes(PERDIDO) && raiasVisiveis.includes(atual) && atual !== PERDIDO;
}
