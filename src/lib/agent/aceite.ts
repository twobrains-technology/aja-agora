/**
 * Onde o "sim" do cliente vira estado — **um** lugar, para os dois canais.
 *
 * ## Por que existe
 *
 * `nextGate` (qualify-state.ts, FIX-386) exige `escolha` ancorada OU
 * `decisionAccepted` para sair do gate `decision`. Quem escrevia isso era só a
 * web (`route.ts`); no WhatsApp o clique de aceite gravava apenas
 * `decisionDispatched`, e o funil ficava preso em `decision` para sempre — o
 * `contract_form` nunca era emitido e nenhuma proposta chegava à Bevi.
 *
 * O efeito medido em produção (conversa `9b9f9aab`, 14/08): o agente, dirigido
 * por uma directive de avanço e sem nenhuma informação de que o fechamento não
 * aconteceu, anunciou duas vezes "você está oficialmente pré-cadastrado no
 * consórcio do Itaú, o boleto chega na sua casa" — com `bevi_proposals = 0`.
 * Não foi alucinação: foi tradução honesta de um estado de servidor quebrado.
 *
 * A causa não é o canal: é a regra estar escrita **duas vezes**. Enquanto
 * existirem duas cópias, corrigir uma delas só adia a próxima reincidência —
 * por isso o aceite passa a ter um escritor só, e um teste de paridade que
 * falha se um canal ganhar uma ação de aceite que o outro não tem.
 *
 * ## O que este módulo NÃO faz
 *
 * Não decide se houve aceite. Quem decide é o canal, a partir de uma ação
 * ESTRUTURADA (clique de card / payload de botão) — nunca de texto livre
 * interpretado. Aqui só se escreve o que já foi decidido, e só depois de
 * conferir a cota contra as ofertas realmente exibidas.
 */

import { listShownOffersForConversation } from "@/lib/agent/orchestrator/choose-offer";
import type { ConversationMetadata } from "@/lib/agent/personas";

export type CanalDeAceite = "web" | "whatsapp";

export type AceiteEstruturado = {
	/** A cota que o cliente nomeou ao aceitar. Ausente quando o aceite é um
	 * "sim" genérico ("Seguir agora", "Contratar") — aí o que vale é
	 * `decisionAccepted`, e a cota já ancorada em `recommendedOffer` segue. */
	groupId?: string | null;
	/** Números que vieram no próprio card emitido pelo servidor. Só entram como
	 * FALLBACK dos campos que a oferta exibida não tiver: a fonte de verdade do
	 * dinheiro é sempre a oferta realmente exibida nesta conversa. */
	doCard?: {
		administradora?: string;
		creditValue?: number;
		termMonths?: number;
		monthlyPayment?: number;
	};
};

export type ResultadoDoAceite = {
	/** O meta com o aceite aplicado. Persistir é responsabilidade de quem chama —
	 * cada canal já tem o seu ponto de escrita e a sua ordem de operações. */
	meta: ConversationMetadata;
	/** O que foi de fato gravado, para log e teste. */
	efeito: "escolha-ancorada" | "decisao-aceita" | "nada-cota-nao-exibida";
};

/**
 * Aplica o aceite estruturado ao metadata.
 *
 * Com `groupId`, a cota é conferida contra as ofertas REALMENTE exibidas nesta
 * conversa antes de amarrar dinheiro (mesma precondição que a tool cumpre —
 * FIX-180/413). Cota que não foi exibida não ancora nada: é o caminho por onde
 * um id inventado viraria compromisso.
 *
 * Sem `groupId`, grava `decisionAccepted` — o "sim" existe, a cota que vale é a
 * que já estava ancorada.
 */
export async function aplicarAceiteEstruturado(args: {
	conversationId: string;
	meta: ConversationMetadata;
	aceite: AceiteEstruturado;
	canal: CanalDeAceite;
}): Promise<ResultadoDoAceite> {
	const { conversationId, meta, aceite, canal } = args;
	const groupId = aceite.groupId?.trim();

	if (!groupId) {
		return { meta: { ...meta, decisionAccepted: true }, efeito: "decisao-aceita" };
	}

	const exibidas = await listShownOffersForConversation(conversationId);
	const oferta = exibidas.find((o) => o.groupId === groupId);

	if (!oferta) {
		console.warn(
			`[aceite] ${canal}: aceite com groupId fora das ofertas exibidas — escolha NÃO ancorada (conv ${conversationId}, group ${groupId})`,
		);
		return { meta, efeito: "nada-cota-nao-exibida" };
	}

	return {
		meta: {
			...meta,
			escolha: {
				groupId,
				administradora: oferta.administradora ?? aceite.doCard?.administradora,
				creditValue: oferta.creditValue ?? aceite.doCard?.creditValue,
				termMonths: oferta.termMonths ?? aceite.doCard?.termMonths,
				monthlyPayment: oferta.monthlyPayment ?? aceite.doCard?.monthlyPayment,
				origem: "afirmacao",
			},
		},
		efeito: "escolha-ancorada",
	};
}
