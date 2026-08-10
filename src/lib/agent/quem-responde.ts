/**
 * Quem responde este cliente agora: o agente ou uma pessoa?
 *
 * Esta é a ÚNICA pergunta que todo caminho de fala com o cliente deve fazer —
 * webhook do WhatsApp, chat da web, reengajamento. Um ponto de decisão, não um
 * guard novo a cada bug.
 *
 * ## Por que existe
 *
 * A trava do agente era gravada na LINHA da conversa (`conversations.status =
 * 'handed_off'`) e consultada por igualdade exata de `waId`. Só que quem é
 * atendido é a PESSOA, e uma pessoa tem várias conversas — uma por canal — com o
 * telefone gravado em formatos diferentes em cada uma.
 *
 * Em prod (2026-08-10) isso apareceu do pior jeito: o atendente assumiu o caso
 * pelo painel (conversa web, `62992496793`, marcada `handed_off`), o cliente
 * respondeu pelo WhatsApp (conversa `556292496793`, ainda `active`), e o AGENTE
 * respondeu por cima do humano que estava atendendo.
 *
 * ## A inversão
 *
 * Antes: "esta conversa está bloqueada?" — blocklist, incompleta por construção;
 * sempre falta o canal/formato que ninguém previu.
 *
 * Agora: "o agente está autorizado a falar com esta pessoa?" — allowlist. Havendo
 * qualquer atendimento humano aberto para ela, a resposta é não, em canal nenhum.
 *
 * A raia do funil NÃO entra nessa conta: mover card não solta nem prende o
 * agente. Quem devolve a conversa é o "Encerrar atendimento", explicitamente.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { chaveTelefoneBR } from "@/lib/whatsapp/mesmo-numero";

export type QuemResponde =
	| {
			quem: "humano";
			/** A conversa onde o atendimento vive — nem sempre a do canal de entrada. */
			conversationId: string;
			handedOffUserId: string | null;
	  }
	| { quem: "agente" };

/**
 * Resolve pelo telefone, cobrindo todos os formatos do mesmo número.
 *
 * `identificador` é o wa_id de quem falou (ou o telefone da conversa web).
 */
export async function quemRespondePara(
	identificador: string | null | undefined,
): Promise<QuemResponde> {
	if (!identificador) return { quem: "agente" };

	// Só as conversas entregues a gente — são poucas, e é o único estado que pode
	// calar o agente. Filtrar aqui evita varrer a tabela pra comparar chave.
	const emAtendimento = await db.query.conversations.findMany({
		where: eq(conversations.status, "handed_off"),
		columns: { id: true, waId: true, handedOffUserId: true },
	});

	if (emAtendimento.length === 0) return { quem: "agente" };

	const chave = chaveTelefoneBR(identificador);

	for (const conv of emAtendimento) {
		// Sem chave utilizável (número fora do padrão BR, id simulado), a
		// comparação cai na igualdade exata — o comportamento que já existia.
		const bate = chave ? chaveTelefoneBR(conv.waId) === chave : conv.waId === identificador;

		if (bate) {
			return {
				quem: "humano",
				conversationId: conv.id,
				handedOffUserId: conv.handedOffUserId ?? null,
			};
		}
	}

	return { quem: "agente" };
}
