import { requireRole } from "@/lib/admin/require-role";
// Seam nível 3 resolvido no merge da onda: reconciliação implementada pelo bloco backend.
import { reconcileTemplateStatuses } from "@/lib/whatsapp/template-sync";

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
