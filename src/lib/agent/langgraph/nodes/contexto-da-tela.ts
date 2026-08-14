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
 * A parcela que ele pediu é alcançável por ALGUMA alavanca — ou não é?
 *
 * O agente errou três vezes seguidas a mesma coisa, com duas máscaras: fez a
 * regra de três ("com R$ 200 a carta cai para ~R$ 9 mil") e apresentou o
 * resultado como produto disponível; e convidou o cliente a "esticar para algo
 * entre R$ 300 e R$ 400" — faixa onde nada existe — na mesma mensagem em que
 * declarava que o piso é R$ 484. Pôr o número certo no contexto não impediu:
 * faltava o VEREDITO, isto é, a conta que fecha a porta.
 *
 * Os três fatos, todos derivados do catálogo que está na tela:
 *   • o crédito implícito da parcela pedida (a regra de três que o modelo faz
 *     sozinho de qualquer jeito — melhor entregá-la já rotulada);
 *   • a menor parcela que existe hoje;
 *   • a menor parcela alcançável esticando o prazo até o maior que a
 *     administradora oferece — o limite da única alavanca que sobra.
 *
 * Se nem esticando chega, a resposta honesta é "não dá por aqui", e o vendedor
 * passa a negociar o que é possível em vez de prometer o que não é.
 */
export function vereditoDeParcelaAlvo(args: { parcelaAlvo: number; ofertas: OfertaNaTela[] }): {
	alcancavel: boolean;
	menorParcelaReal: number;
	menorParcelaEsticandoPrazo: number;
	creditoImplicito: number | null;
	/** A menor carta que existe hoje na categoria — o fundo do catálogo. */
	menorCartaReal: number | null;
	prazoMaximo: number | null;
} | null {
	const faixa = faixaDeParcelas(args.ofertas);
	if (!faixa || args.parcelaAlvo <= 0) return null;

	const prazos = args.ofertas
		.map((o) => o.termMonths)
		.filter((t): t is number => typeof t === "number" && t > 0);
	const prazoMaximo = prazos.length > 0 ? Math.max(...prazos) : null;

	// Esticar o prazo dilui a mesma carta em mais meses. A proporção usa a
	// própria oferta de menor parcela como base — nada é inventado, é o número
	// dela reescalado para o maior prazo que a administradora tem.
	const menorParcelaEsticandoPrazo =
		prazoMaximo && faixa.menor.termMonths
			? Math.round(faixa.min * (faixa.menor.termMonths / prazoMaximo))
			: faixa.min;

	const creditoImplicito =
		faixa.menor.creditValue && faixa.min > 0
			? Math.round(faixa.menor.creditValue * (args.parcelaAlvo / faixa.min))
			: null;

	// A menor CARTA do catálogo fecha o último beco. Sem ela, o modelo lê "essa
	// carta não está à venda" e responde "então vamos procurar uma moto de R$ 8 a
	// 10 mil" — conduzindo o cliente a caçar um produto que não existe em
	// nenhuma faixa. Negar o produto sem fechar o caminho é meio conserto.
	const creditos = args.ofertas
		.map((o) => o.creditValue)
		.filter((c): c is number => typeof c === "number" && c > 0);
	const menorCartaReal = creditos.length > 0 ? Math.min(...creditos) : null;

	return {
		alcancavel: args.parcelaAlvo >= menorParcelaEsticandoPrazo,
		menorParcelaReal: faixa.min,
		menorParcelaEsticandoPrazo,
		creditoImplicito,
		menorCartaReal,
		prazoMaximo,
	};
}

/**
 * O cliente TROCOU de bem — e o bem antigo não volta sozinho.
 *
 * Em 2 de 7 conversas o fecho foi catastrófico pelo mesmo motivo: o cliente
 * ironizou o valor antigo ("ta maluco 1,5 milhão numa moto?") e o agente leu a
 * ironia como intenção de compra — uma vez concordando que ele queria uma moto
 * de R$ 1,5 milhão, outra propondo "voltar ao plano original, a casa de R$ 1,5
 * milhão", jogando fora um funil vivo no último turno.
 *
 * O estado sabe o que aconteceu: a categoria mudou e o valor foi reescrito. É
 * fato de servidor, e é isso que vai ao contexto — não uma proibição de falar
 * da casa (se ele PEDIR para voltar, voltar é o certo).
 */
export function blocoDeBemAbandonado(args: {
	categoriaAtual: string;
	valorAtual?: number;
	categoriaAnterior?: string | null;
	valorAnterior?: number | null;
}): string | null {
	if (!args.categoriaAnterior || args.categoriaAnterior === args.categoriaAtual) return null;
	const antigo = args.valorAnterior ? ` de ${brl(args.valorAnterior)}` : "";
	const atual = args.valorAtual ? ` de ${brl(args.valorAtual)}` : "";
	return (
		`FATO: este cliente TROCOU de bem no meio da conversa — saiu de ${args.categoriaAnterior}` +
		`${antigo} e está em ${args.categoriaAtual}${atual}. O bem e o valor antigos foram ` +
		`ABANDONADOS por ele.\n` +
		`Se ele mencionar o valor antigo, é quase sempre ironia ou comparação — NUNCA trate como ` +
		`pedido de voltar atrás, e nunca proponha retomar o bem antigo por conta própria. Só volte ` +
		`se ele pedir com todas as letras.`
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

	// O VEREDITO — a conta que fecha a porta. Sem ele o modelo faz a regra de
	// três sozinho e apresenta o resultado como produto ("com R$ 200 a carta cai
	// para uns R$ 9 mil"), ou convida a esticar para uma faixa onde nada existe.
	const v =
		args.alvo === "parcela" && args.parcelaAlvo
			? vereditoDeParcelaAlvo({ parcelaAlvo: args.parcelaAlvo, ofertas: args.ofertasNaTela })
			: null;
	const veredito = v
		? `
A CONTA, já feita — use estes números e NÃO invente outros:
` +
			(v.creditoImplicito
				? `- ${brl(args.parcelaAlvo ?? 0)} por mês corresponderia a uma carta de cerca de ` +
					`${brl(v.creditoImplicito)}, e **não existe grupo nessa faixa** — essa carta não está à venda.
`
				: "") +
			(v.menorCartaReal
				? `- A MENOR carta que existe hoje nesta categoria é ${brl(v.menorCartaReal)}. Abaixo dela não ` +
					`há grupo nenhum: procurar um bem mais barato **não resolve** e é beco sem saída — não ` +
					`conduza o cliente por aí.
`
				: "") +
			`- A menor parcela que existe hoje nesta categoria é ${brl(v.menorParcelaReal)}.
` +
			(v.prazoMaximo
				? `- Esticando o prazo até o máximo da administradora (${v.prazoMaximo} meses), a menor ` +
					`parcela possível fica em torno de ${brl(v.menorParcelaEsticandoPrazo)}.
`
				: "") +
			(v.alcancavel
				? `- Ou seja: ${brl(args.parcelaAlvo ?? 0)} É alcançável esticando o prazo. Ofereça esse caminho.`
				: `- Ou seja: ${brl(args.parcelaAlvo ?? 0)} **não é alcançável por nenhuma alavanca** nesta ` +
					`categoria — nem com o prazo no máximo. É PROIBIDO sugerir que ele "estique um pouco" ` +
					`para uma faixa abaixo de ${brl(v.menorParcelaReal)}: ali não há nada. Diga o que é ` +
					`possível de verdade (a de ${brl(v.menorParcelaReal)}, um bem mais barato, ou outra ` +
					`categoria) e deixe a decisão com ele.`)
		: "";

	return (
		`FATO DESTE TURNO: a busca com ${pedido} foi feita agora e a administradora NÃO devolveu ` +
		`nenhum grupo. Não existe oferta nessa faixa — nada apareceu na tela.\n` +
		`Diga isso ao cliente de forma direta e sem rodeio, na sua própria voz. É PROIBIDO afirmar ` +
		`que encontrou opções, que elas "estão na tela" ou pedir que ele escolha entre opções que ` +
		`não existem.${alternativa}\n` +
		`Não peça desculpa repetida nem prometa buscar de novo com o mesmo valor: já foi buscado. ` +
		`O caminho é propor um ajuste concreto — outra faixa, outro prazo, outra categoria.` +
		veredito
	);
}
