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
	/** % que se perdeu da etapa anterior — onde o dinheiro vaza. */
	quedaDaAnterior: number;
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
	origens: LinhaOrigem[];
	serie: PontoSerie[];
	cobertura: CoberturaAtribuicao;
}
