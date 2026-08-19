// src/lib/heatmap/store.ts
//
// Persistência dos eventos do mapa de calor. Server-only.
//
// Mesma regra que rege `visit-store`: analytics NUNCA derruba a navegação. Se
// gravar o clique falhar, o visitante continua na página e o chat continua
// abrindo — perdemos um ponto no mapa, não a venda. Por isso todo caminho é
// best-effort com log de verdade, nunca `catch {}` mudo.

import { db } from "@/db";
import { pageEvents } from "@/db/schema";
import type { HeatmapEvent } from "./events";

/**
 * Grava o lote inteiro numa tacada só.
 *
 * Insert único e não um por evento: o coletor manda em lote justamente pra que
 * uma sessão de leitura longa não vire cinquenta viagens ao banco.
 */
export async function recordPageEvents(
	eventos: HeatmapEvent[],
	visitId: string | null,
): Promise<number> {
	if (eventos.length === 0) return 0;

	try {
		await db.insert(pageEvents).values(
			eventos.map((evento) => ({
				visitId,
				type: evento.type,
				path: evento.path,
				section: evento.section,
				selector: evento.selector,
				label: evento.label || null,
				relX: evento.relX,
				relY: evento.relY,
				pageRelX: evento.pageRelX,
				pageY: evento.pageY,
				scrollPct: evento.scrollPct,
				viewportWidth: evento.viewportWidth,
				viewportHeight: evento.viewportHeight,
				device: evento.device,
				conversationId: evento.conversationId,
				duracaoMs: evento.duracaoMs,
			})),
		);
		return eventos.length;
	} catch (err) {
		console.error("[heatmap] falha ao gravar eventos de página:", err);
		return 0;
	}
}
