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
 * regra de produto é "optin APÓS apresentar a recomendação" — agora é
 * determinística: pré-reveal, o artifact é suprimido.
 *
 * FIX-303 (2026-07-12): revealCompleted sozinho não bastava — o card aparecia
 * logo após a recomendação, sem o usuário ter pedido e antes de qualquer
 * proposta. A regra de produto real é "optin no FECHO" (depois do card de
 * contratação, passo 5) — exige revealCompleted E contractFormDispatched.
 */
export function shouldEmitWhatsappOptin(meta: ConversationMetadata): boolean {
	if (meta.revealCompleted !== true) return false;
	// FIX-303 (rodada r10 onda 2, 2026-07-12): o gatilho migrou de
	// revealCompleted pro FECHO — "Continua o WhatsApp... Anotei seu WhatsApp"
	// aparecia logo após a recomendação, sem o usuário ter pedido e antes de
	// qualquer proposta apresentada. contractFormDispatched (present_contract_
	// form, passo 5) é o marcador de "proposta apresentada", setado em
	// runner.ts quando o form de contratação de fato aparece.
	if (meta.contractFormDispatched !== true) return false;
	// FIX-27: fechamento com erro Bevi pendente — o opt-in não atropela o retry
	// da proposta (determinismo na tool-policy, não só no prompt).
	if (meta.contractRetryPending === true) return false;
	return meta.whatsappOptinShown !== true;
}
