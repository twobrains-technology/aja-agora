import { subDays } from "date-fns";
import {
	computeCobertura,
	computeFunilMidia,
	computeOrigens,
	computeSerie,
} from "@/lib/admin/performance-queries";
import type { PerformanceResponse } from "@/lib/admin/performance-types";
import { requireRole } from "@/lib/admin/require-role";

export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { searchParams } = new URL(request.url);
	const fromParam = searchParams.get("from");
	const toParam = searchParams.get("to");

	const toDate = toParam ? new Date(toParam) : new Date();
	const fromDate = fromParam ? new Date(fromParam) : subDays(new Date(), 30);

	if (Number.isNaN(toDate.getTime()) || Number.isNaN(fromDate.getTime())) {
		return Response.json(
			{ error: "Formato de data inválido. Use ISO 8601 (ex.: 2026-08-01)." },
			{ status: 400 },
		);
	}

	const [funil, origens, serie, cobertura] = await Promise.all([
		computeFunilMidia(fromDate, toDate),
		computeOrigens(fromDate, toDate),
		computeSerie(fromDate, toDate),
		computeCobertura(fromDate, toDate),
	]);

	const response: PerformanceResponse = { funil, origens, serie, cobertura };
	return Response.json(response);
}
