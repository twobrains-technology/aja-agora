// Score do ANALISADOR — o sinal determinístico de que ele não respondeu.
//
// Por que existe: o fallback neutro do turn-analyzer sempre existiu e nunca foi
// medido. Em 01/10/2026 a produção levou 29× HTTP 400 "Your credit balance is
// too low to access the Anthropic API" entre 10:50 e 11:52 (CloudWatch
// `/ecs/tb/prod`, único episódio em 9 dias) e nenhum painel mostrou nada — o
// turno saía com `userIntent: "neutral"`, indistinguível de um turno em que o
// cliente não deu sinal nenhum. As duas sessões que sofreram (`0e5d777a`,
// `8b64899b`) só apareceram quando alguém leu o log de container linha a linha.
//
// Com o analyzer no MESMO modelo do agente (D5), o modo de falha deixa de ser
// raro: as gerações do qwen levam de 3 s a 17 s contra um timeout de 6 s. Este
// score é o denominador — sem ele, "o analyzer caiu" e "não havia o que extrair"
// são o mesmo número.
//
// Booleano de propósito, e emitido em TODO turno de cliente (como 0 também):
// score que só aparece quando vale 1 não tem denominador e a média no Langfuse
// viraria 1,0 para sempre — o mesmo vício que `carta_na_tela` documenta em
// `funil-scores.ts`.
import { getLangfuseClient } from "./client";
import { ambienteLangfuse } from "./env";
import type { Score } from "./funil-scores";

/** `1` = o analyzer caiu no fallback; `0` = respondeu. */
export function scoresDeAnalisador(indisponivel: boolean): Score[] {
	return [
		{
			name: "analisador_indisponivel",
			value: indisponivel ? 1 : 0,
			dataType: "BOOLEAN",
		},
	];
}

/** Publica no trace ATIVO. Observabilidade nunca derruba o turno: sem
 * credencial é no-op, e qualquer erro é engolido com log. */
function publicar(scores: Score[], onde: string): void {
	if (scores.length === 0) return;
	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scores) client.score.activeTrace({ ...score, environment });
	} catch (err) {
		console.error(`[langfuse] ${onde} falhou (ignorado):`, err);
	}
}

export function registrarAnalisadorIndisponivel(indisponivel: boolean): void {
	publicar(scoresDeAnalisador(indisponivel), "registrar analyzer indisponível");
}
