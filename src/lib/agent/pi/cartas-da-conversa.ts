import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import type { GroupSummary } from "@/lib/adapters/types";
import type { CartaLivre } from "./tools-livres";

/** O que está guardado no banco de uma conversa: tipo do card e payload. */
export type ArtefatoDaConversa = { type: string; payload: Record<string, unknown> };

/**
 * As cartas que o CLIENTE JÁ VIOU nesta conversa.
 *
 * Defeito medido em 25/10/2026, no dev, com navegador real: o agente busca cartas no
 * turno 2, o cliente responde "quero a da Canopus" no turno 4, e `mostrar_card`
 * responde "Card NÃO mostrado: para esse card eu preciso de uma carta já buscada nesta
 * conversa — chame buscar_cartas". O índice de cartas do turno (`gruposRevelados`) só
 * vivia dentro do turno da busca, então no turno seguinte o agente era obrigado a
 * rebuscar e o cliente via a mesma tabela de novo.
 *
 * O que o cliente viu está no banco (`artifacts`), com os números REAIS que saíram da
 * busca — não do modelo. Restaurar daí é o que fecha o ciclo: o card do turno seguinte
 * usa o MESMO número, e a proposta continua ancorada na carta que está na tela.
 *
 * A fonte é o payload persistido, não uma busca nova: busca nova pode devolver outras
 * cartas (faixa, disponibilidade, ordem) e o cliente veria número diferente do que já
 * tinha visto — isso é mentira de dado, não variação de serviço.
 */
export function restaurarCartasDaConversa(artefatos: readonly ArtefatoDaConversa[]): {
	grupos: Map<string, GroupSummary>;
	cartas: CartaLivre[];
} {
	const grupos = new Map<string, GroupSummary>();

	for (const a of artefatos) {
		for (const linha of linhasDoArtefato(a.payload)) {
			const id = texto(linha.id) ?? texto(linha.groupId) ?? texto(linha.quotaId);
			if (!id) continue;
			const cart = numero(linha.creditValue);
			const parcela = numero(linha.monthlyPayment);
			const prazo = numero(linha.termMonths);
			if (cart == null || parcela == null || prazo == null) continue;
			// Um card sem número real não restaura nada: é o mesmo contrato de
			// `isUsableGroup` — linha fabricada não entra na tela nem na proposta.
			if (!(cart > 0 && parcela > 0 && prazo > 0)) continue;
			const administradora = texto(linha.administradora);
			if (!administradora) continue;

			const ofertaId = texto(linha.ofertaId);
			// O lance médio é fato OPCIONAL do grupo: o card do hero e o dial o exibem
			// (recommendation-card.tsx, contemplation-dial.tsx). Se ele estava no
			// payload que o cliente viu, tem de sobreviver à restauração — senão o card
			// do turno seguinte mostra a mesma carta SEM a âncora de lance. Ausente no
			// payload → ausente aqui (nunca fabricar lance).
			const avgBidValue = numero(linha.avgBidValue);

			grupos.set(id, {
				id,
				administradora,
				category: (texto(linha.category) as GroupSummary["category"]) ?? "auto",
				creditValue: cart,
				monthlyPayment: parcela,
				adminFeePercent: numero(linha.adminFeePercent) ?? 0,
				termMonths: prazo,
				totalParticipants: numero(linha.totalParticipants) ?? 0,
				// `contempladosMes` é o nome que o card usa; `availableSlots` é o campo
				// cru do reveal. O fallback só funciona com `numero` devolvendo undefined
				// quando o campo não veio — com zero ele nunca acontece.
				availableSlots: numero(linha.contempladosMes) ?? numero(linha.availableSlots) ?? 0,
				...(ofertaId ? { ofertaId } : {}),
				...(avgBidValue != null ? { avgBidValue } : {}),
			});
		}
	}

	const cartas: CartaLivre[] = [...grupos.values()].map((g) => ({
		groupId: g.id,
		administradora: g.administradora,
		carta: g.creditValue,
		parcela: g.monthlyPayment,
		prazoMeses: g.termMonths,
		...(g.availableSlots > 0 ? { contempladosMes: g.availableSlots } : {}),
	}));

	return { grupos, cartas };
}

/** Os cards que carregam carta: comparação, hero e card de grupo individual. */
function linhasDoArtefato(payload: Record<string, unknown>): Record<string, unknown>[] {
	if (Array.isArray(payload.groups)) {
		return payload.groups.filter((g): g is Record<string, unknown> => !!g && typeof g === "object");
	}
	// `group_card`/`recommendation_card` guardam a carta num objeto só.
	if (typeof payload === "object" && (payload.id || payload.groupId)) return [payload];
	return [];
}

const texto = (v: unknown): string | undefined =>
	typeof v === "string" && v.length > 0 ? v : undefined;
/** Número REAL do payload — `undefined` quando o campo não veio (nunca zero no
 * lugar de ausente: é o que permite o fallback entre campos). */
const numero = (v: unknown): number | undefined =>
	typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Lê os artifacts da conversa (join com messages) e devolve o que restaura o índice. */
export async function lerCartasDaConversa(conversationId: string): Promise<ArtefatoDaConversa[]> {
	const linhas = await db.query.messages.findMany({
		where: eq(messages.conversationId, conversationId),
		with: { artifacts: true },
		orderBy: (m, { asc }) => [asc(m.createdAt)],
	});
	return linhas
		.flatMap((m) => m.artifacts.map((a) => ({ type: a.type, payload: a.payload })))
		.filter((a) => a.payload && typeof a.payload === "object");
}
