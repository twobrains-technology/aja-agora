// Mesa de operação — ponto de disparo do transbordo AUTOMÁTICO (FIX-123, D14).
//
// Ao o lead entrar em `na_administradora` (worker FIX-44 → proposal-status-poll), o
// sistema transborda SOZINHO: cria o handoff SEM dono (FIX-125). Espelha o auto-handoff do
// chat de vendas (proxy.ts:handoffToAgents) — a mesa não fica mais dependente do clique
// manual do admin no kanban.
//
// Reusável pela automação (sem `createdBy` de admin). Apoiado na idempotência de
// `createMesaHandoff` (handoff_ativo_existe): re-polls do mesmo lead não duplicam o caso.
//
// TODO(FIX-124): após criar o handoff sem dono, fazer o broadcast a TODOS os atendentes com
// botão interativo "Vou atender" (broadcastCaseToAttendants) — best-effort, isolado num
// try/catch pra que falha de WhatsApp não desfaça o registro do caso.

import { createMesaHandoff } from "./handoff";

export interface DispatchAutoTransbordoResult {
	created: boolean;
	handoffId?: string;
	reason?: string;
}

/**
 * Dispara o transbordo automático de um lead: cria o handoff sem dono. Idempotente — se já
 * existe handoff ativo pro lead, não cria segundo (retorna `created:false`).
 */
export async function dispatchAutoTransbordo(
	leadId: string,
): Promise<DispatchAutoTransbordoResult> {
	const result = await createMesaHandoff({ leadId });
	if (!result.ok) {
		// handoff_ativo_existe é o caso normal em re-poll — não é erro.
		return { created: false, reason: result.reason };
	}
	return { created: true, handoffId: result.handoff.id };
}
