// Mesa de operação — ponto de disparo do transbordo AUTOMÁTICO (FIX-123, D14).
//
// Ao o lead entrar em `na_administradora` (worker FIX-44 → proposal-status-poll), o
// sistema transborda SOZINHO: cria o handoff SEM dono (FIX-125). Espelha o auto-handoff do
// chat de vendas (proxy.ts:handoffToAgents) — a mesa não fica mais dependente do clique
// manual do admin no kanban.
//
// Reusável pela automação (sem `createdBy` de admin). Apoiado na idempotência de
// `createMesaHandoff` (handoff_ativo_existe): re-polls do mesmo lead não duplicam o caso.

import { broadcastCaseToAttendants } from "@/lib/whatsapp/mesa/outbound";
import { createMesaHandoff } from "./handoff";

export interface DispatchAutoTransbordoResult {
	created: boolean;
	handoffId?: string;
	reason?: string;
}

/**
 * Dispara o transbordo automático de um lead: cria o handoff sem dono (FIX-125) e faz o
 * broadcast a TODOS os atendentes com botão "Vou atender" (FIX-124). Idempotente — se já
 * existe handoff ativo pro lead, não cria segundo (retorna `created:false`, sem broadcast).
 *
 * O broadcast é isolado num try/catch: falha do WhatsApp NÃO desfaz o registro do caso
 * (fonte de verdade). Espelha o handoffToAgents do chat de vendas (proxy.ts).
 */
export async function dispatchAutoTransbordo(
	leadId: string,
): Promise<DispatchAutoTransbordoResult> {
	const result = await createMesaHandoff({ leadId });
	if (!result.ok) {
		// handoff_ativo_existe é o caso normal em re-poll — não é erro.
		return { created: false, reason: result.reason };
	}

	try {
		await broadcastCaseToAttendants(result.handoff.id, {
			lead: result.lead,
			proposal: result.proposal,
		});
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "mesa-auto-transbordo",
				handoff_id: result.handoff.id,
				error: err instanceof Error ? err.message : String(err),
				note: "broadcast do transbordo automático falhou (handoff registrado mesmo assim)",
			}),
		);
	}

	return { created: true, handoffId: result.handoff.id };
}
