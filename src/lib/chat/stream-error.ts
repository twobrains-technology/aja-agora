// FIX-110 — onError uniforme pra TODO createUIMessageStream do chat.
//
// Helper único usado por todos os streams do route (web SSE). Garante que um
// erro lançado dentro do `execute` feche o turno com um error part tipado.
//
// B5 (2026-10-05) — o cliente NUNCA vê a mensagem crua do servidor.
//
// Antes, este helper devolvia a mensagem real do `Error` ao navegador: erro de
// gateway em inglês ("credit balance is too low") aparecia na tela de quem está
// comprando. Agora devolve um CÓDIGO de um conjunto fechado, e a UI traduz para
// português (`textoDoErroDoChat`). O código também é o que diz se a falha é de
// crédito, de limite ou de disponibilidade — sem vazar detalhe do servidor.
//
// O módulo é seguro para o cliente (sem I/O, sem credencial): a classificação
// pura mora em `@/lib/llm/erro-do-llm`.

import { classificarErroDoLlm, type TipoDeErroDoLlm } from "@/lib/llm/erro-do-llm";

/** Os códigos que podem chegar ao navegador. Fechado de propósito. */
export type CodigoDeErroDoChat = "llm_billing" | "llm_rate_limit" | "llm_indisponivel" | "erro_interno";

const CODIGO_POR_TIPO: Record<TipoDeErroDoLlm, CodigoDeErroDoChat> = {
	billing: "llm_billing",
	rate_limit: "llm_rate_limit",
	indisponivel: "llm_indisponivel",
	outro: "erro_interno",
};

/** Devolve o CÓDIGO estável (nunca string vazia, nunca a mensagem do servidor). */
export function streamErrorMessage(error: unknown): CodigoDeErroDoChat {
	return CODIGO_POR_TIPO[classificarErroDoLlm(error)];
}

/** O texto que a tela mostra. Vive na UI, não no servidor. */
export const TEXTO_ERRO_DO_CHAT: Record<CodigoDeErroDoChat, string> = {
	llm_billing: "Estamos com uma instabilidade por aqui. Tente novamente em alguns minutos.",
	llm_rate_limit: "Muitas mensagens ao mesmo tempo. Espere um instante e tente de novo.",
	llm_indisponivel: "Não consegui responder agora. Tente novamente em instantes.",
	erro_interno: "Algo deu errado. Tente novamente.",
};

/** Traduz um código (ou qualquer valor inesperado) para o texto em português.
 *  Valor desconhecido cai no genérico — a tela nunca mostra o código cru. */
export function textoDoErroDoChat(codigo: string | null | undefined): string {
	if (codigo && codigo in TEXTO_ERRO_DO_CHAT) {
		return TEXTO_ERRO_DO_CHAT[codigo as CodigoDeErroDoChat];
	}
	return TEXTO_ERRO_DO_CHAT.erro_interno;
}