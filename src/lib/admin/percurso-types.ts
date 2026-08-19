/**
 * Tipos do PERCURSO — quem chegou pela campanha e até onde foi, pessoa por
 * pessoa.
 *
 * A tela de Performance responde "quantos" (8 visitas → 6 conversas → 1
 * fechado). O Pipeline e a ficha do contato respondem "quem", mas só depois que
 * a pessoa deixou telefone. Entre os dois havia um vão: quem clicou no anúncio
 * e não falou, e quem falou e não se identificou, não aparecia NOMINALMENTE em
 * lugar nenhum do painel — e é justamente essa faixa que decide se o problema
 * está no anúncio, na landing ou no agente.
 *
 * `conversations.metadata.maxStageReached` já guardava o avanço de quem nunca
 * virou lead desde o `lead-stage-tracker`, e nenhuma tela lia esse campo.
 */

import type { ChaveEtapaFunil } from "./performance-types";

/**
 * Os oito degraus, do clique no anúncio ao contrato.
 *
 * Do terceiro em diante são exatamente as etapas de `ETAPAS_FUNIL_MIDIA`, com
 * os mesmos critérios de `performance-queries` — duas telas do painel que
 * respondessem "se identificou" com regras diferentes seriam duas verdades para
 * a mesma pergunta.
 *
 * Os dois primeiros são novos, e são o pedido que originou esta tela: separar
 * quem só bateu na porta de quem chegou a ler a página. Somados eles formam a
 * etapa `visitas` do funil de mídia; aqui aparecem partidos porque a decisão é
 * diferente — anúncio errado atrai quem sai na hora, landing fraca perde quem
 * leu e não falou.
 */
export const PASSOS_DO_PERCURSO = [
	{
		chave: "so_chegou",
		label: "Só chegou",
		ajuda: "Abriu a página e saiu sem rolar nem clicar",
	},
	{
		chave: "olhou_a_pagina",
		label: "Olhou a página",
		ajuda: "Rolou ou clicou na landing, mas não abriu o chat",
	},
	{
		chave: "abriu_o_chat",
		label: "Abriu o chat",
		ajuda: "A conversa começou e ele não chegou a escrever",
	},
	{ chave: "escreveu", label: "Escreveu", ajuda: "Mandou ao menos uma mensagem" },
	{ chave: "se_identificou", label: "Se identificou", ajuda: "Deixou telefone ou e-mail" },
	{ chave: "viu_oferta", label: "Viu oferta", ajuda: "Recebeu simulação ou oferta real" },
	{ chave: "proposta", label: "Proposta", ajuda: "Proposta criada na administradora" },
	{ chave: "fechado", label: "Fechado", ajuda: "Contrato fechado" },
] as const;

export type PassoDoPercurso = (typeof PASSOS_DO_PERCURSO)[number]["chave"];

/** Ordem canônica — o índice É a profundidade. Forward-only, como o funil. */
export const ORDEM_DOS_PASSOS = PASSOS_DO_PERCURSO.map(
	(p) => p.chave,
) as readonly PassoDoPercurso[];

export function rotuloDoPasso(passo: PassoDoPercurso): string {
	return PASSOS_DO_PERCURSO.find((p) => p.chave === passo)?.label ?? passo;
}

/**
 * De qual degrau do percurso fala cada etapa do funil de mídia.
 *
 * É o que torna o funil da tela de Performance clicável sem inventar um segundo
 * vocabulário: clicar em "Se identificaram" abre esta tela filtrada em
 * `se_identificou`. `visitas` mapeia para `null` de propósito — a etapa inteira
 * é a tela sem filtro nenhum.
 */
export const PASSO_DA_ETAPA_DO_FUNIL: Record<ChaveEtapaFunil, PassoDoPercurso | null> = {
	visitas: null,
	conversas: "abriu_o_chat",
	engajadas: "escreveu",
	identificados: "se_identificou",
	viram_oferta: "viu_oferta",
	propostas: "proposta",
	fechados: "fechado",
};

/** Como o filtro de passo lê a lista. */
export type ModoDoPasso = "parou" | "alcancou";

export interface FiltroPercurso {
	from: Date;
	to: Date;
	/** Chave de canal como a tabela por origem monta (`campanha:ig`, `direto`). */
	origem?: string | null;
	campanha?: string | null;
	passo?: PassoDoPercurso | null;
	/** `parou` = o percurso terminou aqui; `alcancou` = chegou ao menos aqui. */
	modo?: ModoDoPasso;
	/** Busca por nome, telefone ou e-mail. */
	q?: string | null;
	limit?: number;
	offset?: number;
}

/**
 * Uma PESSOA e o percurso dela.
 *
 * Uma linha por pessoa, não por chegada: o mesmo visitante que clicou no
 * anúncio três vezes é um lead só, e a pergunta "até onde ele foi" tem uma
 * resposta só. As chegadas viram a contagem `chegadas`.
 */
export interface PessoaDoPercurso {
	/** Chave estável da pessoa: o contato quando conhecido, senão o visitante. */
	chave: string;
	contactId: string | null;
	visitorId: string;
	nome: string | null;
	telefone: string | null;
	email: string | null;
	canal: "web" | "whatsapp";
	/**
	 * O rótulo CRU da origem (`ig · 120250956902860104 · 12025098957333`).
	 *
	 * Ótimo para colar no gerenciador de anúncios, ilegível numa coluna de
	 * tabela — por isso a tela mostra `descreverOrigem` e guarda este no `title`,
	 * como a pipeline já fazia.
	 */
	origemLabel: string;
	origemTipo: "campanha" | "click-to-whatsapp" | "referencia" | "direto";
	origemFonte: string | null;
	campanha: string | null;
	criativo: string | null;
	landingPath: string | null;
	primeiraChegada: string;
	/** Último sinal de vida: a chegada mais recente ou a última mensagem dele. */
	ultimaAtividade: string;
	chegadas: number;
	conversas: number;
	mensagensDoCliente: number;
	passo: PassoDoPercurso;
	/**
	 * A raia do lead, quando existe — `na_administradora`, `em_atendimento`,
	 * `aguardando_pagamento` e afins caem todas em `proposta` no percurso, e sem
	 * isto a tela perderia a diferença entre elas.
	 */
	stageDoLead: string | null;
	/** Lead marcado como `perdido`. Não é um degrau: é um selo sobre o degrau. */
	perdido: boolean;
	/** Conversa mais recente da pessoa — o link para ler o que ela falou. */
	conversationId: string | null;
}

export interface ResumoDoPasso {
	chave: PassoDoPercurso;
	label: string;
	ajuda: string;
	/** Quantas pessoas PARARAM neste degrau. */
	pessoas: number;
}

export interface PercursoResponse {
	pessoas: PessoaDoPercurso[];
	/** Total de pessoas que o filtro alcança (a página mostra um pedaço). */
	total: number;
	/**
	 * A escada inteira do período, sempre SEM o filtro de passo aplicado — é o
	 * denominador que dá sentido à lista filtrada. Com o filtro dentro, clicar em
	 * "Escreveu" mostraria uma escada com um degrau só.
	 */
	resumo: ResumoDoPasso[];
	/** Pessoas no período, ignorando o filtro de passo. */
	totalDePessoas: number;
	/** Chegadas no período — quantos cliques as pessoas somaram. */
	totalDeChegadas: number;
}
