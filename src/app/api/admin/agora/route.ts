import { computeConversasAoVivo, computePulso } from "@/lib/admin/agora-queries";
import type { AgoraResponse } from "@/lib/admin/agora-types";
import { perfilIndisponivel } from "@/lib/admin/perfil-dos-visitantes";
import { computePerfilDosVisitantes } from "@/lib/admin/perfil-dos-visitantes-queries";
import { requireRole } from "@/lib/admin/require-role";

/**
 * Estado da operação neste minuto. Sem cache de propósito: é plantão — dado de
 * um minuto atrás já mandaria alguém correr atrás da conversa errada.
 */
export async function GET() {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const [pulso, conversas] = await Promise.all([computePulso(), computeConversasAoVivo()]);

	// O perfil é acessório à sala de guerra: se a leitura dele falhar, o pulso e
	// as conversas continuam de pé e o bloco declara que não mediu — em vez de
	// derrubar a tela inteira por causa de um card.
	let perfil: Awaited<ReturnType<typeof computePerfilDosVisitantes>>;
	try {
		perfil = await computePerfilDosVisitantes();
	} catch (erro) {
		console.error("[agora] leitura do perfil dos visitantes falhou", erro);
		perfil = perfilIndisponivel("Não foi possível ler o perfil agora");
	}

	const response: AgoraResponse = {
		pulso,
		perfil,
		conversas,
		geradoEm: new Date().toISOString(),
	};

	return Response.json(response, {
		headers: { "Cache-Control": "no-store" },
	});
}
