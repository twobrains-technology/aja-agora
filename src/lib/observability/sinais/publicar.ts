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
export type Score = {
	name: string;
	value: number | string;
	dataType?: "BOOLEAN" | "NUMERIC" | "CATEGORICAL";
	comment?: string;
	/** Quando o score é de SESSÃO (não do turno) — id da conversa. */
	sessionId?: string;
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
				})),
			)}`,
		);
	} catch {
		// Sinal é observabilidade: nunca pode custar o turno do cliente.
	}
}
