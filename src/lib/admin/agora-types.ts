/**
 * Tipos da tela "Agora" — a sala de guerra.
 *
 * Responde a UMA pergunta: o que está acontecendo neste minuto e o que precisa
 * de gente. Não é relatório; é plantão. Tudo aqui é do presente ou do dia.
 */

import type { LeadStage } from "./lead-stages";
import type { Origem } from "./origem-label";

/** Minutos de silêncio depois dos quais a conversa deixa de ser "ao vivo". */
export const JANELA_AO_VIVO_MIN = 60;

/** Minutos sem resposta que tornam uma espera do cliente digna de alerta. */
export const ESPERA_CRITICA_MIN = 5;

export interface PulsoAgora {
	visitasUltimaHora: number;
	conversasAoVivo: number;
	/** Cliente falou e ninguém respondeu ainda — a fila que dói. */
	esperandoResposta: number;
	/** Transbordos de mesa sem dono. */
	semDonoNaMesa: number;
	emAtendimentoNaMesa: number;
	leadsHoje: number;
	fechadosHoje: number;
}

export interface ConversaAoVivo {
	conversationId: string;
	leadId: string | null;
	canal: "web" | "whatsapp";
	nome: string | null;
	stage: LeadStage | null;
	ultimaMensagem: string | null;
	ultimaMensagemDe: "user" | "assistant" | "system" | null;
	ultimaAtividadeAt: string;
	minutosParado: number;
	/** A última palavra foi do cliente. */
	esperandoResposta: boolean;
	emHandoff: boolean;
	origem: Origem;
}

export interface AgoraResponse {
	pulso: PulsoAgora;
	conversas: ConversaAoVivo[];
	/** Instante da apuração — a tela mostra pra ninguém olhar dado velho achando que é ao vivo. */
	geradoEm: string;
}
