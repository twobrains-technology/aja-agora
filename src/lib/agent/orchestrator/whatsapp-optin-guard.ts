import type { ConversationMetadata } from "@/lib/agent/personas";

/**
 * Guard de duplicação do present_whatsapp_optin (PF-07).
 *
 * O prompt instrui o agent a chamar a tool apenas uma vez por conversa,
 * mas o modelo pode chamar 2x (alucinação, falha de cache, conversation
 * longa). Sistema enforça via metadata.whatsappOptinShown — se já mostrou,
 * o artifact é suprimido. Runner também grava shown=true após emitir.
 */
export function shouldEmitWhatsappOptin(meta: ConversationMetadata): boolean {
	return meta.whatsappOptinShown !== true;
}
