// src/lib/conversions/chave-do-inicio-de-conversa.ts
//
// A chave que faz a Meta reconhecer o pixel e a CAPI como o MESMO início de
// conversa (item B3).
//
// Módulo PURO e minúsculo de propósito: ele é importado dos DOIS lados da
// ponte — do navegador, onde o pixel manda `eventID`, e do servidor, onde o
// evento é gravado com `eventKey` (que `meta-capi.ts` envia como `event_id`).
// Se o formato vivesse em cada lado, bastaria alguém mexer num deles para a
// Meta passar a contar o mesmo início duas vezes, e o sintoma seria um número
// bom demais no Gerenciador — o pior tipo de defeito de medição, porque
// ninguém investiga uma métrica que subiu.
//
// O prefixo `chat:` separa este espaço do `<leadId>:<evento>` que o
// `registry.ts` usa. Sem ele, um id sorteado no cliente poderia, em teoria,
// colidir com a chave de um marco de venda — e o índice único no banco
// descartaria a venda em silêncio.

/**
 * O nome que a Meta vê. Tem que ser IDÊNTICO ao `trackCustom` do pixel
 * (`meta-pixel.ts`): a deduplicação exige nome e id iguais nos dois caminhos.
 */
export const NOME_CHAT_INICIADO = "ChatIniciado";

export function chaveDoInicioDeConversa(eventId: string): string {
	return `chat:${eventId}:chat_iniciado`;
}
