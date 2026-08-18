// O registro de um card ENVIADO ao cliente — uma linha de marcador no histórico
// e a linha do artifact.
//
// ## Por que existe
//
// O log do admin (e qualquer investigação de conversa depois) lê a tabela
// `messages`. Um card não tem texto, então sem uma linha marcadora
// `[card: tipo]` o turno some do histórico: quem revisa vê o cliente clicar e o
// agente não responder nada.
//
// O fluxo do grafo já fazia isso (`langgraph/nodes/persist.ts`). Os handlers de
// clique do WhatsApp (`whatsapp/interactive-handlers.ts`) não faziam — mandavam
// o card pela API da Meta e seguiam. Em 16/08/2026 isso custou caro: revisando
// a conversa `fd76e393`, o "Ver outras opções" aparecia como um texto solto
// ("Claro! Essas são as outras opções…") sem card nenhum, e a leitura natural
// foi "o agente anunciou e não mostrou". O teste de camada 1 do próprio handler
// provava o contrário — o card É enviado. Investigou-se um defeito de funil que
// não existia.
//
// ## O que este módulo NÃO faz
//
// Não envia nada. Quem envia decide se deu certo e só então registra: card que
// falhou no envio não pode deixar rastro de card entregue, ou o log volta a
// mentir — na direção oposta.

import { db } from "@/db";
import { artifacts as artifactsTable } from "@/db/schema";
import { simulatorNow } from "@/lib/utils/simulator-clock";
import { type Channel, saveMessage } from "./messages";

/**
 * Registra no histórico um card que JÁ foi entregue ao cliente.
 *
 * Devolve o id da mensagem marcadora — útil para quem precisar ligar mais
 * coisas a ela.
 */
export async function registrarCardEnviado(args: {
	conversationId: string;
	tipo: string;
	payload: Record<string, unknown>;
	channel: Channel;
	personaId?: string | null;
}): Promise<string> {
	const { conversationId, tipo, payload, channel, personaId } = args;

	const messageId = await saveMessage(
		conversationId,
		"assistant",
		`[card: ${tipo}]`,
		channel,
		personaId,
	);
	await db.insert(artifactsTable).values({
		messageId,
		type: tipo,
		payload,
		createdAt: simulatorNow(),
	});
	return messageId;
}
