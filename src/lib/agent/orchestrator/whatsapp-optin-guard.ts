import type { ConversationMetadata } from "@/lib/agent/personas";

/**
 * Guard do present_whatsapp_optin.
 *
 * PF-07 (duplicação): o prompt instrui o agent a chamar a tool apenas uma vez
 * por conversa, mas o modelo pode chamar 2x — metadata.whatsappOptinShown
 * suprime a repetição. Runner grava shown=true após emitir.
 *
 * BUG-OPTIN-ENGOLE-GATES (2026-06-04, E2E real): o modelo às vezes disparava o
 * optin no MEIO da qualificação ("Sim, tenho reserva" → form de celular) — o
 * artifact ativava o guard anti-atropelo e SUPRIMIA os gates lance-value/
 * lance-embutido/identify, matando o funil do docx de forma intermitente. A
 * regra de produto sempre foi "optin APÓS apresentar a recomendação" (system
 * prompt) — agora é determinística: pré-reveal, o artifact é suprimido.
 */
export function shouldEmitWhatsappOptin(meta: ConversationMetadata): boolean {
	if (meta.revealCompleted !== true) return false;
	return meta.whatsappOptinShown !== true;
}
