import { computeConversasAoVivo, computePulso } from "@/lib/admin/agora-queries";
import type { AgoraResponse } from "@/lib/admin/agora-types";
import { requireRole } from "@/lib/admin/require-role";

/**
 * Estado da operação neste minuto. Sem cache de propósito: é plantão — dado de
 * um minuto atrás já mandaria alguém correr atrás da conversa errada.
 */
export async function GET() {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const [pulso, conversas] = await Promise.all([computePulso(), computeConversasAoVivo()]);

	const response: AgoraResponse = {
		pulso,
		conversas,
		geradoEm: new Date().toISOString(),
	};

	return Response.json(response, {
		headers: { "Cache-Control": "no-store" },
	});
}
