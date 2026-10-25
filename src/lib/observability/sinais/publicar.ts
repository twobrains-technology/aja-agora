// SINAIS DO TURNO — observabilidade LOCAL, sem SDK nem serviço externo.
//
// O Langfuse saiu inteiro (B6 da campanha 2026-10-19). O que ele fazia aqui era
// uma coisa só: emitir SCORE por nome/valor sobre o turno que estava rodando
// (funil, condução, busca, falhas de tool, marco de negócio). Esses scores
// alimentavam painel e monitor — e nenhum deles está no caminho de resposta do
// cliente.
//
// O que sobra é o mesmo sinal, gravado onde o produto consegue ler depois: uma
// linha estruturada, com prefixo estável (`[sinal]`), JSON de um lado e campos
// do outro. É grepável, entra no CloudWatch por stdout e serve de base pra
// qualquer painel ou alarme sem dependência de terceiro.
//
// REGRA QUE NÃO MUDA: observabilidade NUNCA derruba o turno. Tudo aqui é try/catch
// e sempre devolve void.
//
// A partir de 2026-10-21 este módulo também guarda o LIVRO-CAIXA local das chamadas
// de LLM que não passam pelo vendedor (`registrarUsoDeIa`). O preço do turno já é
// gravado no próprio turno (`pi/turno-livre.ts`); analyzer, copiloto da mesa e
// insights do admin gastam dinheiro em produção e ficavam fora da conta depois que o
// Langfuse saiu (P314) — o custo do CPC tem que fechar por qualquer chamada.
import { db } from "@/db";
import { usoDeIa } from "@/db/schema";
import { custoDoTurnoCents } from "@/lib/agent/pi/precos";

export type Score = {
	name: string;
	value: number | string;
	dataType?: "BOOLEAN" | "NUMERIC" | "CATEGORICAL";
	comment?: string;
	/** Quando o score é de SESSÃO (não do turno) — id da conversa. */
	sessionId?: string;
	/** Quando o score é de UM TURNO — o id do trace que a UI mandou junto. */
	traceId?: string;
};

/** O ambiente vai carimbado em cada linha. `CAIXA_LABEL` é a mesma fonte que a
 * caixa usa, então `` `dev` `` e `` `production` `` não se misturam na leitura. */
export function ambienteDeObservabilidade(env: NodeJS.ProcessEnv = process.env): string {
	return env.CAIXA_LABEL?.trim() || (env.NODE_ENV === "production" ? "production" : "local");
}

/** Emite um conjunto de scores. Uma linha por lote — barato e ordenado. */
export function publicarScores(scores: readonly Score[], onde: string): void {
	if (scores.length === 0) return;
	try {
		const ambiente = ambienteDeObservabilidade();
		console.log(
			`[sinal] onde=${onde} ambiente=${ambiente} scores=${JSON.stringify(
				scores.map((s) => ({
					name: s.name,
					value: s.value,
					...(s.dataType ? { dataType: s.dataType } : {}),
					...(s.comment ? { comment: s.comment } : {}),
					...(s.sessionId ? { sessionId: s.sessionId } : {}),
					...(s.traceId ? { traceId: s.traceId } : {}),
				})),
			)}`,
		);
	} catch {
		// Sinal é observabilidade: nunca pode custar o turno do cliente.
	}
}

/**
 * O que uma chamada de LLM gastou — o mínimo pra linha de `uso_de_ia`.
 * `conversationId` é opcional porque nem toda chamada nasce de uma conversa (o
 * insight de lead só tem o lead).
 */
export type UsoDeIaDaChamada = {
	conversationId?: string | null;
	modelo: string;
	tokensInput: number;
	tokensOutput: number;
};

/**
 * Grava a linha de `uso_de_ia` de UMA chamada de LLM fora do turno do vendedor.
 *
 * `custoUsdCents` segue a mesma disciplina de `pi/turno-livre.ts` e de
 * `admin/custo-de-ia.ts`: preço desconhecido vira `null` (não calculável), nunca
 * `0`. Chamada sem token nenhum não gera linha. Nunca lança: livro-caixa não pode
 * derrubar a resposta de quem chamou.
 */
export async function registrarUsoDeIa(uso: UsoDeIaDaChamada): Promise<void> {
	if (uso.tokensInput <= 0 && uso.tokensOutput <= 0) return;
	try {
		await db.insert(usoDeIa).values({
			conversationId: uso.conversationId ?? null,
			modelo: uso.modelo,
			tokensInput: uso.tokensInput,
			tokensOutput: uso.tokensOutput,
			custoUsdCents: custoDoTurnoCents({
				modelo: uso.modelo,
				tokensInput: uso.tokensInput,
				tokensOutput: uso.tokensOutput,
			}),
		});
	} catch (erro) {
		console.error("[uso-de-ia] chamada fora do turno não registrada (ignorado):", erro);
	}
}
