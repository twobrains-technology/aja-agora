// FIX-110 — guard de turno vazio (server).
//
// Root cause REAL do "agente mudo" (uso manual Kairo, PROD, 2026-06-30): um
// turno de texto-livre do usuário fechava com sucesso ("ok") SEM emitir nenhuma
// part visível (sem texto, tool, artifact, gate, transição ou handoff). O stream
// fecha, o status do client volta a "ready" (o input libera — por isso o usuário
// conseguiu digitar "travou?"), mas NENHUMA resposta aparece. Ele espera e nada;
// só "destrava" no input seguinte.
//
// `isTurnEmpty` lê o registro acumulado pelo TurnTrace (que já espelha todas as
// UI parts escritas no writer instrumentado) e diz se o turno terminou mudo. O
// route usa isso SÓ no user-turn (onde o agente SEMPRE deveria responder algo) —
// não nos handlers de action, que têm casos legítimos sem resposta textual
// (ex.: opt-in/decline silencioso). Quando vazio, o route emite o fallback.

export type TurnEmissionRecord = {
	textChars: number;
	toolCount: number;
	artifactCount: number;
	gate: string | null;
	handoff: boolean;
	transitionedTo: string | null;
};

/** Fallback honesto exibido quando o turno fecharia mudo. PT-BR, sem travessão
 * (regra de copy sem cara de IA) e sem prometer nada — só recupera o diálogo. */
export const EMPTY_TURN_FALLBACK = "Acho que me perdi por aqui. Pode mandar de novo, por favor?";

export function isTurnEmpty(rec: TurnEmissionRecord): boolean {
	return (
		rec.textChars === 0 &&
		rec.toolCount === 0 &&
		rec.artifactCount === 0 &&
		!rec.gate &&
		!rec.handoff &&
		!rec.transitionedTo
	);
}
