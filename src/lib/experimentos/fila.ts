// FIX-434 (D4) — a FILA do A/B: um contador atômico no Postgres, por experimento.
//
// ── Por que uma fila, e não um hash ──────────────────────────────────────────
//
// A atribuição antiga era `FNV-1a(visitId) % 2`: uma moeda honesta, mas SEM
// memória. Com pouca massa ela dá 4 seguidas no mesmo braço — e o dono lê o
// teste com poucas dezenas de pessoas, então o desequilíbrio aparece como viés
// de leitura, não como azar. A fila garante **alternância estrita**: a 1ª
// conversa web nova cai em A, a 2ª em B, a 3ª em A…
//
// ── Por que no banco, e não em memória ───────────────────────────────────────
//
// O app roda em várias tasks do ECS. Um contador em memória (ou no processo)
// exigiria coordenação que não existe; no Postgres o `UPDATE … RETURNING` é
// atômico por linha e o segundo request espera o lock e leva o valor seguinte.
// É por isso que o teste cria 2N braços EM PARALELO e cobra `|A − B| ≤ 1` — um
// contador com corrida perderia incrementos e desequilibraria a leitura.
//
// A tabela é `experimento_fila` (`experimento` text pk, `proximo` bigint). O id
// do experimento é o mesmo `CHAVE_DO_TESTE_NO_METADATA` que o registro usa: um
// teste novo é uma linha nova, não uma coluna nova.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { experimentoFila } from "@/db/schema";

/**
 * O próximo índice da fila do experimento — 0-based e atômico.
 *
 * A 1ª chamada cria a linha e devolve 0; cada chamada seguinte incrementa e
 * devolve o valor novo. Duas chamadas concorrentes NUNCA leem o mesmo índice:
 * o `ON CONFLICT … DO UPDATE` serializa na linha.
 */
export async function proximoIndiceDaFila(experimento: string): Promise<number> {
	const [linha] = await db
		.insert(experimentoFila)
		.values({ experimento, proximo: 0 })
		.onConflictDoUpdate({
			target: experimentoFila.experimento,
			set: { proximo: sql`${experimentoFila.proximo} + 1` },
		})
		.returning({ proximo: experimentoFila.proximo });

	if (!linha) {
		throw new Error(
			`proximoIndiceDaFila: o banco não devolveu a linha da fila (experimento=${experimento})`,
		);
	}
	return Number(linha.proximo);
}

/**
 * O braço que esta entrada recebe, na ordem dos `bracos` passados.
 *
 * A fila é do EXPERIMENTO, não do braço: a lista de braços chega de fora (a
 * fonte única é `VARIANTES_DO_TELEFONE`), e um braço novo no meio da lista é
 * uma decisão de produto, não deste módulo.
 */
export async function bracoDaFila<T extends string>(
	experimento: string,
	bracos: readonly T[],
): Promise<T> {
	if (bracos.length === 0) {
		throw new Error(`bracoDaFila: nenhum braço para o experimento "${experimento}"`);
	}
	const indice = await proximoIndiceDaFila(experimento);
	return bracos[indice % bracos.length];
}
