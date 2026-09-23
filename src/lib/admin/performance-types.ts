/**
 * Tipos da tela de Performance — o funil de MÍDIA (começa na visita, não no
 * lead) e o desempenho por origem.
 *
 * Compartilhado entre a rota da API e a UI.
 */

import type { FunilDeHandoff } from "./handoff-queries";
import type { Origem } from "./origem-label";

// ─── Funil de mídia ─────────────────────────────────────────────────────────

/**
 * As oito etapas, do anúncio ao contrato. Todas derivadas de tabela real —
 * não existe tabela de eventos paralela, de propósito (ver a spec de
 * 2026-08-03): engajamento é `messages`, oferta é `artifacts`, proposta é
 * `bevi_proposals`, fechamento é `leads.stage`.
 *
 * A ORDEM segue a jornada REAL deste produto, não a genérica de e-commerce:
 * o cliente se identifica ANTES de ver oferta, porque a Bevi exige CPF pra
 * simular. Com a ordem invertida a tela mostrava "Se identificaram" com mais
 * gente do que "Viram oferta" — 200% de uma etapa pra outra, um funil que
 * cresce.
 *
 * Todas as etapas depois de `visitas` contam apenas conversas COM ORIGEM
 * conhecida. É o que faz disto um funil de MÍDIA: conversa que nunca passou
 * pela landing (WhatsApp orgânico, por exemplo) não nasceu de uma visita e
 * infla o funil sem pertencer a ele. O funil comercial completo vive na seção
 * de baixo da mesma tela, e a faixa de cobertura diz quanto um representa do
 * outro.
 */
export const ETAPAS_FUNIL_MIDIA = [
	{ chave: "visitas", label: "Visitas", ajuda: "Chegadas ao site e cliques em anúncio" },
	{ chave: "conversas", label: "Conversas", ajuda: "Abriram o chat" },
	// AJA-01 — o vazamento que estava somado dentro de "Engajaram". A primeira
	// mensagem da maioria das conversas web é o texto do CTA, então
	// `engajadas` como `EXISTS messages.role='user'` dava 99% de engajamento
	// enquanto 47% das conversas tinham uma única mensagem.
	{
		chave: "so_pre_preenchida",
		label: "Só mandaram a mensagem do anúncio",
		ajuda: "Mensagem pré-preenchida e nada mais",
	},
	{
		chave: "engajadas",
		label: "Iniciaram a conversa",
		ajuda: "Escreveram algo além da mensagem pré-preenchida",
	},
	{
		chave: "identificados",
		label: "Se identificaram",
		ajuda:
			"Chegou pelo WhatsApp — o canal já entrega o número e o perfil — ou deixou contato na web",
	},
	{ chave: "viram_oferta", label: "Viram oferta", ajuda: "Receberam simulação ou oferta real" },
	{
		chave: "propostas",
		label: "Conversas com proposta",
		ajuda: "Proposta criada na administradora — conta conversas, não linhas de proposta",
	},
	{ chave: "fechados", label: "Fechados", ajuda: "Contrato fechado" },
] as const;

export type ChaveEtapaFunil = (typeof ETAPAS_FUNIL_MIDIA)[number]["chave"];

/**
 * As etapas que RAMIFICAM o funil — não são degraus da mesma cadeia.
 *
 * `so_pre_preenchida` (AJA-01) reparte "Conversas" em dois destinos: quem só
 * mandou o texto do anúncio e quem iniciou a conversa. Ela NÃO é o passo
 * anterior de "Iniciaram a conversa": quem parou ali não "virou" quem começou
 * a conversar. Tratar as duas como degraus vizinhos diria que 7 conversas
 * encolheram para 5 por causa da ramificação, e a queda real (as 2 que nunca
 * escreveram nada próprio) sumiria da leitura.
 */
export const ETAPAS_RAMIFICADAS: ReadonlySet<ChaveEtapaFunil> = new Set(["so_pre_preenchida"]);

export interface EtapaFunilMidia {
	chave: ChaveEtapaFunil;
	label: string;
	ajuda: string;
	count: number;
	/** % em relação ao topo do funil (visitas). */
	percentDoTopo: number;
	/**
	 * % em relação às CONVERSAS — o denominador do funil de produto.
	 *
	 * Medir tudo contra as visitas espremia as seis etapas de baixo numa lasca
	 * de 0,06%: 19 conversas contra 30.147 visitas são três ordens de grandeza,
	 * e o desenho perdia justamente as etapas que carregam a informação. Visita
	 * → conversa é outra pergunta, com outro denominador e outra decisão, e por
	 * isso virou um componente separado ("A porta").
	 */
	percentDasConversas: number;
	/** % que se perdeu da etapa anterior — onde o dinheiro vaza. */
	quedaDaAnterior: number;
	/**
	 * Quantas conversas PARARAM nesta etapa (chegaram aqui e não passaram).
	 *
	 * Absoluto, não percentual: "44,4% saíram aqui" sobre 18 conversas é
	 * precisão falsa — o que se conserta é "8 pararam aqui".
	 */
	pararamAqui: number;
	/**
	 * Dessas, quantas ainda estão VIVAS — o cliente escreveu nos últimos dias e
	 * a conversa não foi encerrada.
	 *
	 * É a diferença entre duas decisões opostas: conserte o agente (morreu) ou
	 * puxe de volta (está viva — o watchdog de retomada existe para isso). Sem
	 * separar, o painel manda consertar o que só precisava de um empurrão.
	 */
	aindaVivas: number;
}

/**
 * O degrau que não é degrau: quantas chegadas viraram conversa.
 *
 * Não é uma etapa do funil — é um limiar, com denominador próprio (visitas) e
 * uma decisão própria ("dá para confiar nesse número?"). Espremê-lo na mesma
 * escada das outras etapas foi o que tornou o funil ilegível.
 */
export interface PortaDoFunil {
	/**
	 * PESSOAS únicas que chegaram no período — o número em destaque, e o mesmo
	 * que a tela de Percurso mostra.
	 *
	 * Passou a ser o protagonista em 24/08/2026, por decisão do Kairo. Antes o
	 * destaque era `visitas`, e as três telas de medição abriam com três números
	 * diferentes para a mesma pergunta ("quanta gente chegou?"): 756 aqui, 261 no
	 * Percurso, 150 no Mapa de calor. Nenhum estava errado e nenhum fechava com o
	 * vizinho — e um painel em que os números não batem não é consultado, é
	 * discutido.
	 */
	pessoas: number;
	/** Chegadas (sessões). Uma pessoa pode chegar mais de uma vez. */
	visitas: number;
	/**
	 * PESSOAS que abriram conversa — o número que fecha com a escada do Percurso.
	 *
	 * Existe porque unificar só o TOPO não bastou. Em 24/08/2026, com as chegadas
	 * já corrigidas, esta tela dizia "8 abriram conversa" e o Percurso somava 7
	 * (5 escreveram + 1 se identificou + 1 viu oferta). Os dois estavam certos: são
	 * 8 conversas de 7 pessoas, porque alguém abriu o chat duas vezes com 15
	 * segundos de diferença. Mas o operador não tem como saber isso olhando, e o
	 * que ele vê é o painel se contradizendo de novo.
	 */
	pessoasQueConversaram: number;
	/** Conversas abertas. Uma pessoa pode abrir mais de uma. */
	conversas: number;
	/** % das PESSOAS que chegaram e falaram com o agente. */
	taxaDeEntrada: number;
	/**
	 * Por qual porta a conversa entrou.
	 *
	 * Era um gráfico de barras próprio, e duas categorias não são um gráfico —
	 * são uma frase. Como frase o dado continua na tela, ao lado do número que
	 * ele qualifica, sem gastar um card inteiro.
	 */
	web: number;
	whatsapp: number;
}

// ─── Desempenho por origem ──────────────────────────────────────────────────

export interface LinhaOrigem {
	origem: Origem;
	visitas: number;
	conversas: number;
	/**
	 * Conversas em que o cliente se identificou — a regra é do CANAL.
	 *
	 * No WhatsApp, quem entrou: o canal entrega o número e o nome de perfil sem o
	 * cliente digitar nada. Na web, quem deixou contato (telefone ou e-mail no
	 * lead). Decisão do dono, 23/09/2026: *"whatsapp entrou já pode considerar que
	 * se identificou, já na web, você tem que considerar quando conseguirmos
	 * coletar"*. A definição mora em `conversaIdentificada`.
	 */
	identificados: number;
	/**
	 * Conversas com contato CONHECIDO, tenha o cliente informado ou não — é quem
	 * a régua consegue alcançar. Vai ao lado de `identificados` porque mede outra
	 * coisa, e o rótulo de cada um diz qual.
	 */
	comTelefone: number;
	/** Propostas CRIADAS na administradora — conta linhas, não pessoas. */
	propostas: number;
	fechados: number;
	/** Fechados ÷ visitas, em %. A pergunta que decide onde a verba vai. */
	taxaFechamento: number;
}

// ─── Série temporal ─────────────────────────────────────────────────────────

export interface PontoSerie {
	date: string;
	visitas: number;
	conversas: number;
	identificados: number;
}

// ─── Cobertura de atribuição ────────────────────────────────────────────────

/**
 * Quanto do funil tem origem conhecida. Existe pra a tela não mentir: conversa
 * criada antes desta instrumentação, ou por caminho que não passou pela
 * landing, não tem origem — e some do relatório por origem. Sem este número, a
 * soma das origens pareceria o total.
 */
export interface CoberturaAtribuicao {
	conversasComOrigem: number;
	conversasTotal: number;
	percent: number;
}

// ─── "Quem chegou" (cheiro de perfil) ───────────────────────────────────

/** Uma barra da lista de distribuição: um rótulo e quantas conversas caíram nele. */
export interface BarraDeQuemChegou {
	rotulo: string;
	total: number;
}

/**
 * A distribuição de quem INICIOU a conversa, por bem e por faixa de valor.
 *
 * "Iniciou a conversa" é o degrau do AJA-01: conversa cuja única mensagem do
 * cliente é o texto do anúncio fica FORA daqui — senão o perfil medido seria o
 * do CTA, não o de quem falou.
 *
 * `comValorInformado` existe porque a faixa de valor só é conhecida por quem
 * passou do gate de crédito; sem ele a lista de faixas pareceria somar o total
 * quando na verdade reparte um pedaço dele.
 */
export interface QuemChegou {
	total: number;
	porBem: BarraDeQuemChegou[];
	porFaixa: BarraDeQuemChegou[];
	comValorInformado: number;
}

export interface PerformanceResponse {
	funil: EtapaFunilMidia[];
	porta: PortaDoFunil;
	/** Distribuição por bem e faixa de valor entre quem iniciou a conversa. */
	quemChegou: QuemChegou;
	origens: LinhaOrigem[];
	serie: PontoSerie[];
	cobertura: CoberturaAtribuicao;
	/**
	 * O que acontece DEPOIS que o bot entrega o lead ao time (item D1).
	 *
	 * Vive ao lado do funil de mídia e não dentro dele: o de cima mede o que o
	 * produto faz sozinho, este mede o que a mesa faz. Somar os dois numa escada
	 * só esconderia justamente a fronteira que interessa — a passagem de bastão.
	 */
	handoff: FunilDeHandoff;
}
