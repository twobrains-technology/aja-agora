// Guarda própria das rotas de simulação (não importa comum.ts, que é de F3):
// 404 fora de dev; depois, admin.
import { requireRole } from "@/lib/admin/require-role";
import { isPlaygroundEnabled } from "@/lib/playground/ambiente";

export async function guardaDaSimulacao(): Promise<
	{ resposta: Response; email: null } | { resposta: null; email: string | null }
> {
	if (!isPlaygroundEnabled()) {
		return { resposta: new Response("Not Found", { status: 404 }), email: null };
	}
	const { error, session } = await requireRole("admin");
	if (error) return { resposta: error, email: null };
	return { resposta: null, email: session.user.email ?? null };
}
