// GET /api/admin/heatmap — leitura do mapa de calor para o painel.

import { subDays } from "date-fns";

import { requireRole } from "@/lib/admin/require-role";
import { ehPathDeLanding, LANDINGS_COM_MAPA } from "@/lib/heatmap/events";
import { computeMapaDeCalor, type Desfecho, type FiltroDevice } from "@/lib/heatmap/queries";

const DEVICES: FiltroDevice[] = ["todos", "mobile", "tablet", "desktop"];
const DESFECHOS: Desfecho[] = ["todos", "lead", "ganho"];

export async function GET(request: Request) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const { searchParams } = new URL(request.url);

	const path = searchParams.get("path") ?? "/";
	if (!ehPathDeLanding(path)) {
		return Response.json(
			{ error: `Página sem mapa de calor. Disponíveis: ${LANDINGS_COM_MAPA.join(", ")}.` },
			{ status: 400 },
		);
	}

	const fromParam = searchParams.get("from");
	const toParam = searchParams.get("to");
	const from = fromParam ? new Date(fromParam) : subDays(new Date(), 30);
	const to = toParam ? new Date(toParam) : new Date();

	if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
		return Response.json(
			{ error: "Formato de data inválido. Use ISO 8601 (ex.: 2026-08-01)." },
			{ status: 400 },
		);
	}

	const deviceParam = searchParams.get("device") ?? "todos";
	const desfechoParam = searchParams.get("desfecho") ?? "todos";

	// Allowlist e não coerção silenciosa: valor desconhecido virando "todos" faria
	// a tela mostrar um recorte diferente do que o filtro diz estar aplicado.
	if (!DEVICES.includes(deviceParam as FiltroDevice)) {
		return Response.json({ error: `Dispositivo inválido: ${deviceParam}.` }, { status: 400 });
	}
	if (!DESFECHOS.includes(desfechoParam as Desfecho)) {
		return Response.json({ error: `Desfecho inválido: ${desfechoParam}.` }, { status: 400 });
	}

	const mapa = await computeMapaDeCalor({
		path,
		from,
		to,
		device: deviceParam as FiltroDevice,
		desfecho: desfechoParam as Desfecho,
	});

	return Response.json(mapa);
}
