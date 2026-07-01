// Mesa de operação — protocolo do botão "Vou atender" (FIX-124/125, D15/D16).
//
// Contrato ÚNICO compartilhado entre quem ESCREVE o botão (outbound.ts — broadcast) e
// quem LÊ o clique (routing.ts — dispatch do claim; processor.ts — precedência). Módulo
// sem dependências pra evitar ciclo de import entre outbound ↔ routing.
//
// O id do botão é `mesa_claim:<handoffId>` — carrega o handoff pro claim atômico.

export const CLAIM_BUTTON_ID_PREFIX = "mesa_claim:";
export const CLAIM_BUTTON_TITLE = "Vou atender";

/** True se o replyId é um clique em "Vou atender" (id `mesa_claim:<handoffId>`). */
export function isMesaClaimReply(replyId: string): boolean {
	return replyId.startsWith(CLAIM_BUTTON_ID_PREFIX);
}

/** Extrai o handoffId do id do botão `mesa_claim:<handoffId>`. */
export function handoffIdFromClaimReply(replyId: string): string {
	return replyId.slice(CLAIM_BUTTON_ID_PREFIX.length);
}
