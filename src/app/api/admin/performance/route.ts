import { recorteDaRequisicao } from "@/lib/admin/filtro-variante";
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

	// O recorte do teste A/B (FIX-404), lido logo depois do período — URL `ab` >
	// cookie `aja_ab` > nenhum. `[]` significa "todas", e aí nenhum número muda.
	const recorte = recorteDaRequisicao(request);

	// O card do TESTE DO TELEFONE não é cortado por este recorte (D7): ele tem
	// rota própria (`performance/telefone-ab`) e conta por VISITA, de propósito.
	const [funil, porta, quemChegou, origens, serie, cobertura, handoff, custos] = await Promise.all([
		computeFunilMidia(fromDate, toDate, recorte),
		computePorta(fromDate, toDate, recorte),
		computeQuemChegou(fromDate, toDate, recorte),
		computeOrigens(fromDate, toDate, recorte),
		computeSerie(fromDate, toDate, recorte),
		computeCobertura(fromDate, toDate, recorte),
		computeFunilDeHandoff(fromDate, toDate, undefined, recorte),
		computeCustosDoCpc(fromDate, toDate, recorte),
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
