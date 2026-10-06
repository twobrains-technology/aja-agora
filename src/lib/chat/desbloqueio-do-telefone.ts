/**
 * FIX-395 / FIX-396 — o ESTADO do desbloqueio do telefone, decidido por regra
 * pura e testável.
 *
 * As duas variantes do teste (docs/decisoes/2026-09-29-copia-do-desbloqueio-do-
 * telefone.md) diferem em ONDE o telefone é pedido:
 *
 *  - **A** ("pede-antes"): o telefone vem ANTES de liberar a comparação — nada
 *    da oferta aparece na tela antes do número.
 *  - **B** ("borrado"): as OFERTAS aparecem embaçadas (blur em tudo, sem valor
 *    legível) com um clique para desbloquear, e o telefone vem em seguida.
 *
 * A variante `C` não existe: até 29/09 o `pede-antes` chamava-se B e o borrado
 * chamava-se C — e o borrado mostrava a parcela legível. O dono cortou a terceira
 * ponta e mandou embaçar tudo. A mudança de comportamento mora no render
 * (`comDesbloqueioDoTelefone` + `OfertaEmbacada`).
 *
 * O módulo é PURO (sem banco, sem React) porque a MESMA pergunta — "esta visita
 * já pode ver a comparação?" — é feita no servidor (para decidir o que emitir)
 * e no cliente (para decidir o que renderizar). Uma implementação só evita as
 * duas respostas divergirem, que é o defeito clássico deste tipo de card.
 */

import type { ArtifactType } from "./types";
import type { VarianteDoTelefone } from "./variante-da-visita";

/**
 * - `livre` — pode ver a comparação inteira; nenhum passo de telefone.
 * - `pede-antes` — variante A: pede o telefone ANTES de liberar a comparação.
 * - `borrado` — variante B: as ofertas aparecem embaçadas e o telefone libera.
 */
export type EstadoDoDesbloqueio = "livre" | "pede-antes" | "borrado";

/** Os dois estados que exigem um card de telefone na tela. */
export type EstadoComCard = Exclude<EstadoDoDesbloqueio, "livre">;

export interface EntradaDoDesbloqueio {
	variante: VarianteDoTelefone;
	/**
	 * O telefone já é conhecido? (lead identificado, identidade da casa, ou o
	 * próprio número em conversa de WhatsApp). Nesse caso NÃO se pede de novo —
	 * regra do FIX-395: "Telefone já conhecido (lead identificado) ⇒ não pede de
	 * novo: passa direto".
	 */
	celularConhecido: boolean;
	/**
	 * A pessoa tocou "Agora não" (só existe na variante C). É saída REAL: o card
	 * não pode virar pedágio, senão ela abandona o site inteiro em vez de
	 * abandonar só o formulário. Recusou ⇒ a comparação segue inteira e legível,
	 * sem telefone.
	 */
	recusado?: boolean;
}

/**
 * Qual experiência esta visita recebe agora.
 *
 * A ordem importa: telefone conhecido e recusa GANHAM da variante. Só decide
 * entre B e C quem ainda não deu o número nem disse "agora não".
 */
export function estadoDoDesbloqueio(input: EntradaDoDesbloqueio): EstadoDoDesbloqueio {
	if (input.celularConhecido) return "livre";
	if (input.recusado) return "livre";
	return input.variante === "A" ? "pede-antes" : "borrado";
}

/** `true` quando há card de telefone a renderizar (o caminho oposto de `livre`). */
export function temCardDeTelefone(estado: EstadoDoDesbloqueio): estado is EstadoComCard {
	return estado !== "livre";
}

/**
 * A comparação pode ser LIBERADA (visível e legível) neste estado?
 *
 * Vale para as duas variantes — é a pergunta que o servidor faz antes de emitir
 * os cards de oferta, e a que o cliente faz antes de renderizar o conteúdo
 * borrado. Em `pede-antes` NADA da comparação pode aparecer; em `borrado` ela
 * aparece, mas com o conteúdo escondido (isso é decisão de renderização, não
 * deste predicado).
 */
export function comparacaoLiberada(estado: EstadoDoDesbloqueio): boolean {
	return estado !== "pede-antes";
}

/**
 * Os cards que REVELAM número de oferta (carta, parcela, prazo, taxa, lance…).
 *
 * Lista ÚNICA, lida pelo servidor (o `pipeOrchestratorToWriter` segura o card no
 * braço A) e pelo cliente (`comDesbloqueioDoTelefone` esconde no A / embaça no
 * B). Estava duplicada — e a cópia só tinha `comparison_table` e
 * `recommendation_card`, então `simulation_result` e `group_card` (FIX-433)
 * passavam legíveis antes do telefone nos dois braços. Uma implementação só
 * evita que as duas voltem a divergir.
 */
export const CARDS_QUE_REVELAM_OFERTA: ReadonlySet<ArtifactType> = new Set<ArtifactType>([
	"comparison_table",
	"recommendation_card",
	"simulation_result",
	"group_card",
	"financing_comparison",
	"scenarios",
]);
