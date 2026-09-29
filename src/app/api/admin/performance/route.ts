import { computeFunilDeHandoff } from "@/lib/admin/handoff-queries";
import {
	computeCobertura,
	computeCustosDoCpc,
	computeFunilMidia,
	computeOrigens,
	computePorta,
	computeQuemChegou,
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

	const [funil, porta, quemChegou, origens, serie, cobertura, handoff, custos] = await Promise.all([
		computeFunilMidia(fromDate, toDate),
		computePorta(fromDate, toDate),
		computeQuemChegou(fromDate, toDate),
		computeOrigens(fromDate, toDate),
		computeSerie(fromDate, toDate),
		computeCobertura(fromDate, toDate),
		computeFunilDeHandoff(fromDate, toDate),
		computeCustosDoCpc(fromDate, toDate),
	]);

	const response: PerformanceResponse = {
		funil,
		porta,
		quemChegou,
		origens,
		serie,
		cobertura,
		handoff,
		custos,
	};
	return Response.json(response);
}
