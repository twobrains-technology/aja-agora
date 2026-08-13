// O TURNO CONDUZIU, OU SÓ FALOU?
//
// Módulo PURO e sem dependência de observabilidade, de propósito: a mesma
// pergunta é feita por dois consumidores que não podem discordar —
//
//   • o score `conducao_entregue` (`observability/langfuse/conducao-scores.ts`),
//     que mede a taxa em produção;
//   • o marcador de pendência do watchdog (`nodes/persist.ts` →
//     `pendingGateAfterTurn`), que decide se alguém volta a puxar a conversa.
//
// Se cada um tivesse a própria definição, o painel diria "conduziu" enquanto o
// watchdog achasse que não (ou pior, o contrário) — e ninguém notaria por
// semanas. Uma função, dois consumidores.
//
// A distinção que ela carrega: **card de APRESENTAÇÃO não conduz.** Um
// comparativo de cinco grupos é bonito e não pede nada; o cliente olha e não
// sabe o que fazer. Foi exatamente o desfecho da sessão `ff8f2080` (produção
// 2026-08-13): cinco cards, 30 caracteres de fala, zero pergunta — e todo sinal
// determinístico verde, porque todos mediam BYTES.
import type { TurnEvent } from "@/lib/agent/orchestrator/types";

/** Artifacts que PEDEM uma resposta. Os de apresentação (`group_card`,
 * `recommendation_card`, `comparison_table`, `simulation_result`, `scarcity`…)
 * mostram e ficam quietos — e o próprio desenho do reveal admite isso: mesmo
 * com os cards na tela, o turno ainda depende da âncora para convidar o cliente
 * a reagir. */
export const ARTIFACTS_QUE_CONDUZEM: ReadonlySet<string> = new Set([
	"decision_prompt",
	"contract_form",
	"two_paths",
	"embedded_bid",
	"quick_reply",
	"topic_picker",
	"contemplation_dial",
]);

export type FlagsDeConducao = {
	/** Turno do CLIENTE. Turno de servidor (directive) fala sem perguntar por
	 * design — cobrá-lo encheria o alerta de ruído e re-armaria o watchdog. */
	isUserTurn: boolean;
	/** O texto ENTREGUE (pós-filtro) fez uma pergunta que ocupa a cota do turno.
	 * Nunca a fala crua do modelo: o que vale é o que o cliente recebeu. */
	perguntaEntregue: boolean;
	/** O caso foi para a mesa — quem conduz agora é gente. */
	handoff: boolean;
	/** Contrato FECHADO. Não confundir com formulário despachado: com o form na
	 * tela e o cliente ainda sem preencher, conduzir é mais importante que
	 * nunca. */
	contractClosed: boolean;
};

/** Os artifacts entregues no turno, extraídos dos eventos. */
export function artifactsDosEventos(eventos: readonly TurnEvent[]): string[] {
	return eventos
		.filter((ev): ev is Extract<TurnEvent, { type: "artifact" }> => ev.type === "artifact")
		.map((ev) => ev.artifactType);
}

/**
 * O cliente terminou este turno com alguma coisa a responder?
 *
 * `null` = a pergunta não se aplica (turno de servidor, conversa encerrada) —
 * distinto de `false`, que é o defeito. Quem pontua ou marca pendência trata os
 * dois de forma diferente: `null` não vira score nem vira cobrança.
 */
export function turnoEntregouConducao(
	eventos: readonly TurnEvent[],
	flags: FlagsDeConducao,
): boolean | null {
	if (!flags.isUserTurn || flags.contractClosed) return null;
	if (flags.perguntaEntregue || flags.handoff) return true;
	if (eventos.some((ev) => ev.type === "gate")) return true;
	return artifactsDosEventos(eventos).some((a) => ARTIFACTS_QUE_CONDUZEM.has(a));
}
