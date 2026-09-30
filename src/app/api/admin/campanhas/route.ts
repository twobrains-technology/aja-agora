import { computeCampanhas } from "@/lib/admin/campanhas-queries";
import { recorteDaRequisicao } from "@/lib/admin/filtro-variante";
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
	// O recorte por BRAÇO de experimento A/B (`?ab=<experimento>:<braço>`, ou o
	// cookie `aja_ab` no mesmo formato), logo depois do período — como nas outras
	// telas. `[]` = todas. Com recorte ativo o custo da Meta sai marcado como não
	// aplicável (D6); o funil continua visível.
	const recorte = recorteDaRequisicao(request);

	return Response.json(await computeCampanhas(de, ate, recorte));
}
