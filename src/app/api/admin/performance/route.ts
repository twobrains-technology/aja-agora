import { computeFunilDeHandoff } from "@/lib/admin/handoff-queries";
import {
	computeCobertura,
	computeFunilMidia,
	computeOrigens,
	computePorta,
	computeSerie,
} from "@/lib/admin/performance-queries";
import type { PerformanceResponse } from "@/lib/admin/performance-types";
import { periodoDaRequisicao } from "@/lib/admin/periodo-da-requisicao";
import { requireRole } from "@/lib/admin/require-role";

export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	// Dia inteiro, no fuso do negócio, com a precedência URL > cookie > hoje — a
	// mesma regra que o filtro da tela usa, resolvida num lugar só.
	const { de: fromDate, ate: toDate } = periodoDaRequisicao(request);

	const [funil, porta, origens, serie, cobertura, handoff] = await Promise.all([
		computeFunilMidia(fromDate, toDate),
		computePorta(fromDate, toDate),
		computeOrigens(fromDate, toDate),
		computeSerie(fromDate, toDate),
		computeCobertura(fromDate, toDate),
		computeFunilDeHandoff(fromDate, toDate),
	]);

	const response: PerformanceResponse = { funil, porta, origens, serie, cobertura, handoff };
	return Response.json(response);
}
