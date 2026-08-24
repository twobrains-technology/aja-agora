import {
	computeCobertura,
	computeFunilMidia,
	computeOrigens,
	computePorta,
	computeSerie,
} from "@/lib/admin/performance-queries";
import type { PerformanceResponse } from "@/lib/admin/performance-types";
import { resolverPeriodo } from "@/lib/admin/periodo";
import { requireRole } from "@/lib/admin/require-role";

export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { searchParams } = new URL(request.url);

	// Dia inteiro, no fuso do negócio, e HOJE quando não vem nada — a mesma regra
	// que o filtro da tela usa (`periodo.ts`).
	const periodo = resolverPeriodo(searchParams.get("from"), searchParams.get("to"));

	if (!periodo) {
		return Response.json(
			{ error: "Formato de data inválido. Use ISO 8601 (ex.: 2026-08-01)." },
			{ status: 400 },
		);
	}

	const { de: fromDate, ate: toDate } = periodo;

	const [funil, porta, origens, serie, cobertura] = await Promise.all([
		computeFunilMidia(fromDate, toDate),
		computePorta(fromDate, toDate),
		computeOrigens(fromDate, toDate),
		computeSerie(fromDate, toDate),
		computeCobertura(fromDate, toDate),
	]);

	const response: PerformanceResponse = { funil, porta, origens, serie, cobertura };
	return Response.json(response);
}
