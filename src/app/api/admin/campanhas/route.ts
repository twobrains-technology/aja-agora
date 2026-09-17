import { computeCampanhas } from "@/lib/admin/campanhas-queries";
import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import { requireRole } from "@/lib/admin/require-role";

/**
 * O gasto por campanha e o funil do CRM ao lado — a rota da tela `/admin/campanhas`.
 *
 * O período é o do painel inteiro (`periodoDaRequisicao`): URL > cookie `aja_periodo`
 * > hoje. Uma tela que resolvesse a janela por conta própria voltaria a quebrar a
 * regra de o período acompanhar a PESSOA.
 */
export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { de, ate } = periodoDaRequisicao(request);

	return Response.json(await computeCampanhas(de, ate));
}
