import { requireRole } from "@/lib/admin/require-role";

// ─── SEAM NÍVEL 3 (bloco-whatsapp-templates-admin × bloco-whatsapp-templates-backend) ───
// A reconciliação de status (poll que chama `listTemplates()` e atualiza as linhas
// locais) é implementada pelo BLOCO BACKEND em `src/lib/whatsapp/template-sync.ts`,
// que NÃO existe neste worktree (evita conflito de arquivo entre os blocos).
//
// Implementamos a rota contra este STUB LOCAL. No merge da onda, o orquestrador
// (backend entra ANTES) troca o stub pelo import real:
//
//   import { reconcileTemplateStatuses } from "@/lib/whatsapp/template-sync";
//
// e remove a função abaixo.
// TODO(bloco-backend): trocar pelo import real de "@/lib/whatsapp/template-sync".
async function reconcileTemplateStatuses(): Promise<{ updated: number }> {
	return { updated: 0 };
}

/**
 * POST — força uma reconciliação de status de TODOS os templates (sync-all).
 * FIX-204 (D4). Botão "sincronizar status" no admin. Protegida por role admin.
 *
 * Pega transições que o webhook `message_template_status_update` possa ter perdido
 * (spec §Sincronização de status).
 */
export async function POST() {
	const { error } = await requireRole("admin");
	if (error) return error;

	const result = await reconcileTemplateStatuses();
	return Response.json({ ok: true, ...result });
}
