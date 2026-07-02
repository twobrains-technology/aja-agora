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

	// FIX-206: reconcileTemplateStatuses → listTemplates → getWabaConfig() lança
	// se WHATSAPP_ACCESS_TOKEN/WHATSAPP_WABA_ID faltarem/invalidos (ou a Meta
	// devolver erro). Sem try/catch isso virava 500 MUDO no admin. Envolvemos e
	// devolvemos 502 JSON acionável, como em [id]/submit.
	try {
		const result = await reconcileTemplateStatuses();
		return Response.json({ ok: true, ...result });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return Response.json(
			{ error: "Falha ao sincronizar status com a Meta", message },
			{ status: 502 },
		);
	}
}
