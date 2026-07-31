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

	// O CASO TEM QUE CAIR NA RAIA DA MESA, NÃO SÓ EXISTIR.
	//
	// Reportado por Kairo (2026-07-30): proposta fechada no WhatsApp não apareceu
	// pro atendente. Uma das duas causas era esta — o handoff era criado, mas o LEAD
	// continuava na raia anterior do board, então o card não aparecia onde a mesa
	// olha.
	//
	// O desenho original contava com o worker de polling (FIX-44) mover o lead pra
	// `na_administradora` e SÓ ENTÃO transbordar. Só que o fecho passou a transbordar
	// na hora (FIX-235), e o worker "pode levar dias" (comentário do próprio
	// fecho-pedir-oi) — nesse intervalo o caso existia sem estar na raia.
	//
	// `transitionLeadStage` é forward-only por padrão: se o worker já tiver movido o
	// lead adiante, isto é no-op e não regride nada.
	try {
		const { transitionLeadStage } = await import("@/lib/admin/lead-transitions");
		await transitionLeadStage(leadId, "na_administradora", { type: "system" });
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "mesa-auto-transbordo",
				lead_id: leadId,
				error: err instanceof Error ? err.message : String(err),
				note: "falha ao mover o lead pra na_administradora (handoff mantido)",
			}),
		);
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
