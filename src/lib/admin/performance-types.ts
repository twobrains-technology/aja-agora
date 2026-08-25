/**
 * Tipos da tela de Performance — o funil de MÍDIA (começa na visita, não no
 * lead) e o desempenho por origem.
 *
 * Compartilhado entre a rota da API e a UI.
 */

import type { Origem } from "./origem-label";

// ─── Funil de mídia ─────────────────────────────────────────────────────────

/**
 * As sete etapas, do anúncio ao contrato. Todas derivadas de tabela real —
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
	{ chave: "engajadas", label: "Engajaram", ajuda: "Escreveram ao menos uma mensagem" },
	{ chave: "identificados", label: "Se identificaram", ajuda: "Deixaram telefone ou e-mail" },
	{ chave: "viram_oferta", label: "Viram oferta", ajuda: "Receberam simulação ou oferta real" },
	{ chave: "propostas", label: "Propostas", ajuda: "Proposta criada na administradora" },
	{ chave: "fechados", label: "Fechados", ajuda: "Contrato fechado" },
] as const;

export type ChaveEtapaFunil = (typeof ETAPAS_FUNIL_MIDIA)[number]["chave"];

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
	conversas: number;
	/** % das PESSOAS que abriram conversa. */
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
	identificados: number;
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

export interface PerformanceResponse {
	funil: EtapaFunilMidia[];
	porta: PortaDoFunil;
	origens: LinhaOrigem[];
	serie: PontoSerie[];
	cobertura: CoberturaAtribuicao;
}
