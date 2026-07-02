// FIX-195 (P0, qa-dono-produto conv fe2e8a09, 2026-07-01): ao escolher outra cota
// por TEXTO LIVRE ("quero seguir com o BB"), o agente tentava re-resolver o
// grupo/ID e falhava → despejava meta-narrativa admitindo falha técnica ao cliente
// ("esse grupo deu um problema", "preciso trazer os IDs reais") → LOOP.
//
// A cura de raiz é um caminho ESTRUTURADO: o seletor (bloco-b) emite
// `{kind:"choose_offer", groupId, ofertaId?}` e ESTE módulo resolve o grupo
// escolhido server-side (a partir dos artifacts REAIS já exibidos no reveal),
// ancorando a administradora + prazo pro fechamento fechar NO GRUPO CERTO — sem
// re-busca, sem re-resolução, sem meta-narrativa (CONTRATO com bloco-b, adendo B8).

/** Campos ancorados da cota escolhida — alimentam recommendedAdministradora +
 * recommendedOffer (que buildStartContractInput usa como administradoraPreferida
 * + prazoPreferido no fechamento). */
export interface ChosenOffer {
	groupId: string;
	administradora?: string;
	creditValue?: number;
	termMonths?: number;
	monthlyPayment?: number;
}

interface ArtifactRow {
	type: string;
	payload: unknown;
}

/** A cota casa com o groupId escolhido? Aceita as 3 chaves do CONTRATO/reveal
 * (groupId coagido == id == quotaId). */
function matchesGroupId(p: Record<string, unknown>, groupId: string): boolean {
	return p.groupId === groupId || p.id === groupId || p.quotaId === groupId;
}

function pickOffer(p: Record<string, unknown>, groupId: string): ChosenOffer {
	return {
		groupId,
		administradora: typeof p.administradora === "string" ? p.administradora : undefined,
		creditValue: typeof p.creditValue === "number" ? p.creditValue : undefined,
		termMonths: typeof p.termMonths === "number" ? p.termMonths : undefined,
		monthlyPayment: typeof p.monthlyPayment === "number" ? p.monthlyPayment : undefined,
	};
}

/** Procura a cota escolhida (por groupId) entre os artifacts do reveal já
 * persistidos (comparison_table/recommendation_card/group_card/simulation_result).
 * PURO — testável sem DB. Null quando o groupId não foi exibido em nenhum card
 * (nunca inventa um grupo — Lei 3). */
export function findChosenOffer(rows: ArtifactRow[], groupId: string): ChosenOffer | null {
	if (!groupId) return null;
	for (const row of rows) {
		const p = row.payload;
		if (!p || typeof p !== "object" || Array.isArray(p)) continue;
		const payload = p as Record<string, unknown>;
		if (row.type === "comparison_table" && Array.isArray(payload.groups)) {
			for (const g of payload.groups) {
				if (g && typeof g === "object" && matchesGroupId(g as Record<string, unknown>, groupId)) {
					return pickOffer(g as Record<string, unknown>, groupId);
				}
			}
			continue;
		}
		if (matchesGroupId(payload, groupId)) return pickOffer(payload, groupId);
	}
	return null;
}

/** Resolve a cota escolhida a partir dos artifacts persistidos da conversa. */
export async function resolveChosenOffer(
	conversationId: string,
	groupId: string,
): Promise<ChosenOffer | null> {
	const { db } = await import("@/db");
	const { artifacts: artifactsTable, messages: messagesTable } = await import("@/db/schema");
	const { eq } = await import("drizzle-orm");
	const rows = await db
		.select({ type: artifactsTable.type, payload: artifactsTable.payload })
		.from(artifactsTable)
		.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
		.where(eq(messagesTable.conversationId, conversationId));
	return findChosenOffer(rows, groupId);
}
