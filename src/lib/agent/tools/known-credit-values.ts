// FIX-287 (rodada r9 onda 3, veredito r9pos2 §3 P1-2): comparison_table/
// recommendation_card são coagidos a partir do valor-ALVO que a busca (search_
// groups/recommend_groups) aproxima (offer-mapper.ts:141, offer.finalValue) —
// não necessariamente o nominal FIXO real do grupo. simulate_quota já detecta
// e sinaliza essa divergência (creditAdjustmentNotice, ai-sdk.ts:441-467), mas
// isso nunca retroagia pra nenhum comparison_table/recommendation_card, nem do
// mesmo turno nem de turnos seguintes — a tabela seguia mentindo mesmo depois
// do cliente já ter recebido a simulação real daquele MESMO grupo.
//
// Este módulo mina, de TODOS os `simulation_result` já persistidos nesta
// conversa (qualquer turno anterior), o creditValue REAL simulado por
// groupId — simulate_quota SEMPRE devolve o nominal fixo real do grupo (nunca
// resimula pelo valor pedido, comentário FIX-255 em ai-sdk.ts). Combinado com
// o resultado do simulate_quota do turno CORRENTE (runner.ts), dá a fonte
// única de creditValue por groupId usada por coerceRevealCota.
import { eq } from "drizzle-orm";
import { artifacts as artifactsTable, messages as messagesTable } from "@/db/schema";

/** Extrai {groupId, creditValue} de UM artifact `simulation_result` persistido.
 * Outros tipos/payloads malformados → null (não contamina o mapa). */
export function extractKnownCreditValue(
	type: string,
	payload: unknown,
): { groupId: string; creditValue: number } | null {
	if (type !== "simulation_result") return null;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
	const p = payload as Record<string, unknown>;
	const groupId = p.groupId;
	const creditValue = p.creditValue;
	if (typeof groupId !== "string" || groupId.length === 0) return null;
	if (typeof creditValue !== "number" || !Number.isFinite(creditValue) || creditValue <= 0) {
		return null;
	}
	return { groupId, creditValue };
}

/** Carrega o creditValue REAL (já simulado) de cada groupId simulado em
 * qualquer turno desta conversa (ordem cronológica — a simulação mais recente
 * vence, embora o nominal fixo do grupo não deva mudar). */
export async function loadKnownGroupCreditValues(
	conversationId: string,
): Promise<Map<string, number>> {
	const { db } = await import("@/db");
	const rows = await db
		.select({ type: artifactsTable.type, payload: artifactsTable.payload })
		.from(artifactsTable)
		.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
		.where(eq(messagesTable.conversationId, conversationId))
		.orderBy(artifactsTable.createdAt);

	const known = new Map<string, number>();
	for (const row of rows) {
		const extracted = extractKnownCreditValue(row.type, row.payload);
		if (extracted) known.set(extracted.groupId, extracted.creditValue);
	}
	return known;
}
