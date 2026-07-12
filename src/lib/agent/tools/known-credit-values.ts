// FIX-287 (rodada r9 onda 3, veredito r9pos2 §3 P1-2): comparison_table/
// recommendation_card são coagidos a partir do valor-ALVO que a busca (search_
// groups/recommend_groups) aproxima (offer-mapper.ts:141, offer.finalValue) —
// não necessariamente o nominal FIXO real do grupo. simulate_quota já detecta
// e sinaliza essa divergência (creditAdjustmentNotice, ai-sdk.ts:441-467), mas
// isso nunca retroagia pra nenhum comparison_table/recommendation_card, nem do
// mesmo turno nem de turnos seguintes — a tabela seguia mentindo mesmo depois
// do cliente já ter recebido a simulação real daquele MESMO grupo.
//
// FIX-292 (rodada r9 onda 4, veredito r9pos3 §3 P1 Cálculo): o FIX-287 corrigia
// SÓ `creditValue` — `monthlyPayment` (e `termMonths`) do MESMO artifact
// continuavam vindo da estimativa antiga, dessincronizados do creditValue real
// recém-corrigido. Este módulo vira fonte única MULTI-CAMPO por groupId
// (creditValue + monthlyPayment + termMonths, quando disponíveis), não só
// creditValue — todo campo financeiro de um artifact tem que descrever o
// MESMO cenário real. `adminFee` do simulation_result NÃO entra aqui: é valor
// em R$ (offer-mapper.ts:199), unidade diferente de `adminFeePercent` do
// grupo (percentual, offer-mapper.ts:143) — mapear um pro outro seria bug novo.
//
// Este módulo mina, de TODOS os `simulation_result` já persistidos nesta
// conversa (qualquer turno anterior), o cenário REAL simulado por groupId —
// simulate_quota SEMPRE devolve o nominal fixo real do grupo (nunca resimula
// pelo valor pedido, comentário FIX-255 em ai-sdk.ts). Combinado com o
// resultado do simulate_quota do turno CORRENTE (runner.ts), dá a fonte única
// usada por coerceRevealCota.
import { eq } from "drizzle-orm";
import { artifacts as artifactsTable, messages as messagesTable } from "@/db/schema";

/** Cenário financeiro REAL conhecido de UM groupId (minerado de um
 * `simulation_result` persistido). `termMonths` é opcional — só entra quando o
 * payload o traz e é utilizável. */
export interface KnownGroupValue {
	creditValue: number;
	monthlyPayment: number;
	termMonths?: number;
}

/** Extrai {groupId, creditValue, monthlyPayment, termMonths?} de UM artifact
 * `simulation_result` persistido. `creditValue`/`monthlyPayment` são exigidos
 * juntos (fonte única MULTI-CAMPO — payload que só tem um dos dois é
 * inutilizável, nunca contamina o mapa com metade do cenário). Outros tipos/
 * payloads malformados → null. */
export function extractKnownCreditValue(
	type: string,
	payload: unknown,
): ({ groupId: string } & KnownGroupValue) | null {
	if (type !== "simulation_result") return null;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
	const p = payload as Record<string, unknown>;
	const groupId = p.groupId;
	const creditValue = p.creditValue;
	const monthlyPayment = p.monthlyPayment;
	if (typeof groupId !== "string" || groupId.length === 0) return null;
	if (typeof creditValue !== "number" || !Number.isFinite(creditValue) || creditValue <= 0) {
		return null;
	}
	if (
		typeof monthlyPayment !== "number" ||
		!Number.isFinite(monthlyPayment) ||
		monthlyPayment <= 0
	) {
		return null;
	}
	const result: { groupId: string } & KnownGroupValue = { groupId, creditValue, monthlyPayment };
	const termMonths = p.termMonths;
	if (typeof termMonths === "number" && Number.isFinite(termMonths) && termMonths > 0) {
		result.termMonths = termMonths;
	}
	return result;
}

/** Carrega o cenário REAL (já simulado) de cada groupId simulado em qualquer
 * turno desta conversa (ordem cronológica — a simulação mais recente vence,
 * embora o nominal fixo do grupo não deva mudar). */
export async function loadKnownGroupCreditValues(
	conversationId: string,
): Promise<Map<string, KnownGroupValue>> {
	const { db } = await import("@/db");
	const rows = await db
		.select({ type: artifactsTable.type, payload: artifactsTable.payload })
		.from(artifactsTable)
		.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
		.where(eq(messagesTable.conversationId, conversationId))
		.orderBy(artifactsTable.createdAt);

	const known = new Map<string, KnownGroupValue>();
	for (const row of rows) {
		const extracted = extractKnownCreditValue(row.type, row.payload);
		if (extracted) {
			const { groupId, ...value } = extracted;
			known.set(groupId, value);
		}
	}
	return known;
}
