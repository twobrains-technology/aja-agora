// FIX-222 — busca os logos cadastrados em `administradoras` (DB). Separado do
// módulo puro (`administradora-logo.ts`) pra manter a lógica de matching
// testável sem banco. Chamado uma vez por turno em `runAgentTurn`.

import { db } from "@/db";
import { administradoras } from "@/db/schema";
import { buildAdministradoraLogoMap } from "./administradora-logo";

export async function loadAdministradoraLogoMap(): Promise<Map<string, string>> {
	const rows = await db
		.select({ nome: administradoras.nome, logoUrl: administradoras.logoUrl })
		.from(administradoras);
	return buildAdministradoraLogoMap(rows);
}
