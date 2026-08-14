// O que está na tela AGORA, e o que a última busca respondeu — como fato.
//
// Julgamento da conversa pós-correção (14/08): o estado tinha sido curado, mas
// o agente continuou anunciando oferta inexistente. As três frases inventadas
// nasceram do mesmo buraco: **o modelo não sabia o que o cliente estava
// vendo**.
//
//   • "as parcelas variam entre R$ 250 e R$ 400"  → o card na tela dizia R$ 484,16
//   • "as opções com parcela de R$ 200 apareceram" → a busca voltou VAZIA
//   • "as opções na tela têm parcelas nessa faixa"  → a única na tela era R$ 484,16
//
// Havia uma proibição no contexto ("É PROIBIDO dizer que encontrou opções") e
// ela não segurou nada — proibir uma frase não devolve o dado a quem precisa
// dele. O que falta ao modelo é INFORMAÇÃO: quais números estão na tela e o que
// a busca de fato respondeu. Com o fato na mão, dizer a verdade vira o caminho
// mais fácil; sem ele, o vácuo é preenchido com otimismo.
//
// Esta é a fronteira do CLAUDE.md deste projeto: fala feia não vira regex, mas
// o FATO que a contradiz é do servidor e tem que estar no contexto.
export type OfertaNaTela = {
	groupId?: string | null;
	administradora?: string | null;
	creditValue?: number | null;
	monthlyPayment?: number | null;
	termMonths?: number | null;
};

const brl = (v: number) =>
	v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

/** A menor e a maior parcela entre o que está na tela. */
export function faixaDeParcelas(
	ofertas: OfertaNaTela[],
): { min: number; max: number; menor: OfertaNaTela } | null {
	const comParcela = ofertas.filter(
		(o): o is OfertaNaTela & { monthlyPayment: number } =>
			typeof o.monthlyPayment === "number" && o.monthlyPayment > 0,
	);
	if (comParcela.length === 0) return null;
	const ordenadas = [...comParcela].sort((a, b) => a.monthlyPayment - b.monthlyPayment);
	return {
		min: ordenadas[0].monthlyPayment,
		max: ordenadas[ordenadas.length - 1].monthlyPayment,
		menor: ordenadas[0],
	};
}

/**
 * O extrato do que o cliente tem diante dos olhos.
 *
 * Dito em números, não em adjetivos: é isto que impede "as parcelas variam
 * entre R$ 250 e R$ 400" quando a menor da tela é R$ 484,16.
 */
export function blocoDoQueEstaNaTela(ofertas: OfertaNaTela[]): string | null {
	const faixa = faixaDeParcelas(ofertas);
	if (!faixa) return null;
	const quantas = ofertas.length;
	const linha =
		faixa.min === faixa.max
			? `A ÚNICA opção na tela tem parcela de ${brl(faixa.min)}.`
			: `São ${quantas} opções na tela, com parcelas de ${brl(faixa.min)} (a menor) a ${brl(faixa.max)} (a maior).`;
	return (
		`O QUE ESTÁ NA TELA DO CLIENTE AGORA — estes são os únicos números que ele vê:\n${linha}\n` +
		`É PROIBIDO citar qualquer faixa de parcela, prazo ou crédito diferente destes: ele está ` +
		`olhando para a tela enquanto lê você, e um número que não bate destrói a confiança na hora. ` +
		`Se o que ele pediu não está aqui, diga isso com todas as letras em vez de arredondar.`
	);
}

/**
 * A busca voltou vazia — e o cliente merece ouvir isso com a alternativa real.
 *
 * O servidor SABE que voltou vazia (`discoveryEmptyStreak`) e essa informação
 * nunca chegava ao modelo: ele recebia só a proibição de dizer que encontrou.
 * Com o fato e a melhor alternativa concreta, a honestidade deixa de ser
 * renúncia e vira argumento — "para R$ 200 não existe; o menor real é R$ 484,
 * dá para chegar perto esticando o prazo?".
 */
export function blocoDeBuscaVazia(args: {
	alvo: "valor" | "parcela";
	parcelaAlvo?: number;
	creditMax?: number;
	ofertasNaTela: OfertaNaTela[];
}): string | null {
	const pedido =
		args.alvo === "parcela" && args.parcelaAlvo
			? `parcela de ${brl(args.parcelaAlvo)} por mês`
			: args.creditMax
				? `crédito de ${brl(args.creditMax)}`
				: null;
	if (!pedido) return null;

	const faixa = faixaDeParcelas(args.ofertasNaTela);
	const alternativa = faixa
		? ` A opção REAL mais próxima que existe é ${faixa.menor.administradora ?? "a administradora"}: ` +
			`parcela de ${brl(faixa.min)}` +
			(faixa.menor.creditValue ? `, carta de ${brl(faixa.menor.creditValue)}` : "") +
			(faixa.menor.termMonths ? `, em ${faixa.menor.termMonths} meses` : "") +
			`. Ofereça ESSA, explicando a diferença.`
		: "";

	return (
		`FATO DESTE TURNO: a busca com ${pedido} foi feita agora e a administradora NÃO devolveu ` +
		`nenhum grupo. Não existe oferta nessa faixa — nada apareceu na tela.\n` +
		`Diga isso ao cliente de forma direta e sem rodeio, na sua própria voz. É PROIBIDO afirmar ` +
		`que encontrou opções, que elas "estão na tela" ou pedir que ele escolha entre opções que ` +
		`não existem.${alternativa}\n` +
		`Não peça desculpa repetida nem prometa buscar de novo com o mesmo valor: já foi buscado. ` +
		`O caminho é propor um ajuste concreto — outra faixa, outro prazo, outra categoria.`
	);
}
