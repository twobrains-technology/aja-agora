// A RESPOSTA RÁPIDA QUE FAZ SENTIDO NO MOMENTO — derivada do ESTADO, não do texto.
//
// Ordem do dono (27/10/2026, 13:35): *"sempre ter opcoes de responta automatica que facam sentido
// com a dinamica da conversa"*. Medido antes desta mudança: **408 de 3.073** turnos do agente
// (13,3 %) traziam `quick_reply` — o detector de `chips.ts` só reconhecia a lista marcada no texto
// ("1) … 2) …") ou a alternativa escrita ("A ou B?"), então toda pergunta aberta do vendedor
// ("qual dessas fica melhor pra você?") ficava sem botão.
//
// Aqui a opção nasce do FATO do turno: o que o vendedor acabou de perguntar e o que já está na
// tela. Não é guarda de fala — nada é cortado nem reescrito; é o mesmo contrato de UI de
// `manterUmaPergunta`/`garantirChip`: pergunta feita sem toque disponível é pergunta perdida.
// O que o modelo escreve continua mandando: se ele mostrou um card de escolha, o card é a
// resposta e nada é acrescentado (`garantirChip`).

export type MomentoDaConversa = {
	/** Já há carta (oferta real) na tela desta conversa. */
	temCartaNaTela?: boolean;
	/** Canal da conversa — o WhatsApp tem botão de lista, a web tem chip. Hoje os dois usam o
	 * mesmo `quick_reply`; o campo existe para o dia em que divergirem. */
	canal?: "web" | "whatsapp";
};

/** Teto de rótulo: botão é toque, não frase. O mesmo limite de `chips.ts`. */
const MAXIMO = 40;

/**
 * Perguntas de RESPOSTA LIVRE: nenhum botão responde por ela — e um botão genérico ali é pior
 * que nenhum. Hoje, o nome.
 *
 * Medido na rodada de produção de 27/10 (R7, modelo de produção, 155 perguntas do agente): **28**
 * `quick_reply` genéricos ("Pode seguir / Tenho uma dúvida") caíram logo depois de "como posso te
 * chamar?" — convite a pular justamente o dado que salva o lead (P6). A primeira versão desta
 * regex só via "seu nome" e "como você se chama"; o modelo pergunta de outros jeitos.
 */
const RESPOSTA_LIVRE =
	/\b(?:seu|teu)\s+(?:primeiro\s+)?nome\b|\bcomo\s+(?:voc[êe]|vc|posso|eu\s+posso|devo)\s+(?:te\s+|lhe\s+)?(?:se\s+)?cham(?:a|ar|o|á-lo)\b|\bme\s+diz\s+(?:o\s+)?(?:seu\s+)?nome\b|\bqual\s+(?:é|e|eh)?\s*o\s+nome\b|\bposso\s+te\s+chamar\b/i;

/** Um tipo de pergunta → as respostas que a pessoa daria, na voz dela. */
type TipoDePergunta = { quando: RegExp; opcoes: string[] };

/** A ORDEM IMPORTA: a pergunta mais específica ganha. */
const TIPOS: TipoDePergunta[] = [
	{
		// "me manda seu CPF", "posso consultar seu CPF?"
		quando: /\bcpf\b/i,
		opcoes: ["Pode usar meu CPF", "Por que precisa do CPF?"],
	},
	{
		// "quer dar lance?", "o lance ajuda a antecipar?"
		quando: /\blance\b/i,
		opcoes: ["Quero dar lance", "Prefiro só sorteio", "Como funciona o lance?"],
	},
	{
		// "você sabe como é a contemplação?"
		quando: /contempla|sorteio/i,
		opcoes: ["Como é o sorteio?", "E o lance?", "Quanto tempo costuma levar?"],
	},
	{
		// "quanto você consegue pagar de parcela?"
		quando: /parcela|por\s+m[êe]s|mensalidade/i,
		opcoes: ["Até R$ 800", "Até R$ 1.200", "Quero saber o mínimo"],
	},
	{
		// "quanto você pensa em gastar?", "qual valor do bem?"
		quando: /quanto|valor|or[çc]amento|gastar|investir/i,
		opcoes: ["Até R$ 50 mil", "Uns R$ 80 mil", "R$ 100 mil ou mais"],
	},
	{
		// "é carro, moto ou imóvel?"
		quando: /carro|moto|im[óo]vel|tipo\s+de\s+bem|qual\s+bem/i,
		opcoes: ["Carro", "Moto", "Imóvel"],
	},
	{
		// "posso gerar a proposta?", "quer que eu prepare a contratação?"
		quando: /proposta|contrat|contrata[çc]|fechar|fechamos|formul[áa]rio|assinatura/i,
		opcoes: ["Pode gerar a proposta", "Quero ver outra carta"],
	},
	{
		// "quer continuar pelo WhatsApp?"
		quando: /whats\s?app|telefone|celular|n[úu]mero/i,
		opcoes: ["Sigo pelo WhatsApp", "Prefiro aqui no chat"],
	},
];

/** A pergunta é do tipo sim/não — a resposta mais natural é "sim" ou a dúvida. */
const SIM_NAO =
	/^\s*(?:quer|querer|pode|posso|podemos|vamos|prefere|deseja|gostaria|confirma|tudo\s+bem|faz\s+sentido|ok)\b/i;

/** O que a pessoa pode tocar depois da oferta na tela. */
const DEPOIS_DA_OFERTA = ["Quero essa", "Ver outra opção", "Como funciona o lance?"];

/** A conversa continua mesmo quando o vendedor pergunta algo que não é escolha. */
const GENERICO = ["Pode seguir", "Tenho uma dúvida"];

/**
 * As respostas de um toque para a pergunta que o vendedor acabou de fazer.
 *
 * `null` = pergunta de resposta livre (o nome): inventar botão ali seria empurrar a pessoa a
 * não dizer o nome — e o nome é contato.
 */
export function sugestoesDaPergunta(
	pergunta: string,
	momento: MomentoDaConversa = {},
): string[] | null {
	const texto = (pergunta ?? "").trim();
	if (!texto.includes("?")) return null;
	if (RESPOSTA_LIVRE.test(texto)) return null;

	// A PERGUNTA é a última frase. Classificar o texto inteiro pegava palavra de uma explicação
	// anterior ("Vou te explicar como funciona a contemplação\nFaz sentido pra você?") e oferecia
	// "Como é o sorteio?" depois de o vendedor ter acabado de explicar o sorteio.
	const ultimaFrase =
		texto
			.split(/(?<=[?.!])\s+|\n+/)
			.map((f) => f.trim())
			.filter(Boolean)
			.pop() ?? texto;
	const alvo = ultimaFrase.includes("?") ? ultimaFrase : texto;

	for (const tipo of TIPOS) {
		if (tipo.quando.test(alvo)) return tipo.opcoes.slice(0, 4).filter((o) => o.length <= MAXIMO);
	}

	// Pergunta aberta com carta na tela: a decisão da pessoa é sobre o que ela está vendo.
	if (momento.temCartaNaTela) return DEPOIS_DA_OFERTA;

	// A última frase é a pergunta? Só aí o "sim" faz sentido como resposta.
	if (ultimaFrase.includes("?") && SIM_NAO.test(ultimaFrase.replace(/^[^A-Za-zÀ-ÿ]+/, "")))
		return ["Sim, pode seguir", "Ainda tenho uma dúvida"];

	return GENERICO;
}
