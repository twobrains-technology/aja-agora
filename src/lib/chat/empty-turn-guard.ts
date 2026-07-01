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
	// gate/transitionedTo são ESTADO INTERNO do funil (FIX-113) — opcionais e
	// IGNORADOS por isTurnEmpty. Um gate real vem sempre acompanhado da pergunta do
	// gate (texto) ou do texto do agente; a presença do card é refletida em
	// textChars/artifactCount, não neste campo.
	gate?: string | null;
	transitionedTo?: string | null;
	// handoff continua sendo sinal de emissão VISÍVEL: o card de handoff renderiza
	// SOZINHO (o system-prompt proíbe texto no handoff), então textChars=0 é normal.
	handoff?: boolean;
};

/** Fallback honesto exibido quando o turno fecharia mudo. PT-BR, sem travessão
 * (regra de copy sem cara de IA) e sem prometer nada — só recupera o diálogo. */
export const EMPTY_TURN_FALLBACK = "Acho que me perdi por aqui. Pode mandar de novo, por favor?";

/**
 * Turno "mudo" = fechou SEM nenhuma emissão VISÍVEL ao usuário.
 *
 * FIX-113 (trava em afirmação de continuidade, PROD 2026-06-30): o guard antigo
 * também olhava `gate`/`transitionedTo`. Mas esses são ESTADO INTERNO do funil —
 * numa afirmação curta ("blz"/"ta bom") o funil avançava um gate/transição SEM
 * emitir texto/tool/artifact; o guard lia o estado interno, retornava false, o
 * fallback do route NÃO disparava e a tela CONGELAVA. Agora só conta emissão
 * visível: texto, tool ou artifact. `handoff` segue contando porque o card de
 * handoff é a única emissão visível de um turno de handoff (agente calado por
 * design). Gates legítimos não regridem: a pergunta do gate é texto (textChars>0)
 * e o simulator-offer no reveal carrega artifacts (artifactCount>0).
 */
export function isTurnEmpty(rec: TurnEmissionRecord): boolean {
	return (
		rec.textChars === 0 && rec.toolCount === 0 && rec.artifactCount === 0 && !rec.handoff
	);
}
