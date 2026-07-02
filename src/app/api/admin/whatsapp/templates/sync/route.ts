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

	try {
		const result = await reconcileTemplateStatuses();
		return Response.json({ ok: true, ...result });
	} catch (err) {
		// Falha da reconciliação (WABA_ID ausente, Meta 4xx/5xx, timeout) → 502 JSON
		// com message, mesmo formato do [id]/submit/route.ts. NUNCA 500 body-vazio.
		const message = err instanceof Error ? err.message : String(err);
		console.error("[templates/sync] reconciliação falhou:", message);
		return Response.json(
			{ error: "Falha ao sincronizar status com a Meta", message },
			{ status: 502 },
		);
	}
}
