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
	// Nomes das tools chamadas no turno (do TurnTrace). Distingue tool ACIONÁVEL
	// (search_groups → emite artifact) de SILENCIOSA (save_* → só grava no DB).
	// Opcional: records legados sem a lista caem no comportamento antigo. FIX-172.
	toolsCalled?: string[];
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

// FIX-347 (loop-de-goal desamarra, rodada 4, P1.1 — "Acho que me perdi"
// regrediu): esta frase é a REDE FINAL, depois de o orchestrator já ter dado
// ao modelo uma segunda chance com o motivo do corte (`buildEmptyTurnRetryDirective`,
// orchestrator/directives.ts) e do reengage de gate/menção de oferta
// (route.ts) não terem resolvido. Se ela disparar de novo na MESMA conversa,
// repetir a frase idêntica soa quebrado (mesma classe do FIX-266/332, que já
// resolveu isso pro fallback de tool-error). Variante — nunca a mesma frase
// 2x seguidas na mesma conversa.
export const EMPTY_TURN_FALLBACK_REPEAT =
	"Deixa eu tentar de outro jeito: me conta com suas palavras o que você quer ver agora.";

/** FIX-347 — escolhe entre `EMPTY_TURN_FALLBACK` e sua variante conforme o
 * fallback original já ter sido usado antes NESTA conversa (route.ts varre o
 * histórico do assistant, mesmo padrão do `genericAlreadyUsed` em index.ts).
 * Função pura — nunca decide sozinha o que é "já usado", só a saída. */
export function pickEmptyTurnFallback(alreadyUsedBefore: boolean): string {
	return alreadyUsedBefore ? EMPTY_TURN_FALLBACK_REPEAT : EMPTY_TURN_FALLBACK;
}

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
// Tools que NÃO são emissão VISÍVEL por si só — um turno que só as chamou fecha
// MUDO. Duas famílias:
//  - SILENCIOSAS (save_*): só gravam no DB, o usuário não vê nada (FIX-172 — loop
//    de save_contact_name até stepCountIs sem gerar texto, observado no WhatsApp).
//  - DESCOBERTA/DADOS (search/recommend/rates/details/simulate): o RESULTADO é
//    interno (dado pro modelo); o que o usuário vê é o chip transitório "Buscando
//    grupos" + o artifact/texto que a descoberta LEVA a produzir — já contado em
//    artifactCount/textChars. Tratar a descoberta como "visível" era o falso-
//    negativo da PENDURA (FIX-189): turno que só buscou (sem present_*, sem texto)
//    fechava não-vazio → nenhum fallback → o reveal não chegava e o usuário tinha
//    de cutucar ("travou?"). Só present_* e texto/artifact contam como visível.
const NON_VISIBLE_TOOLS = new Set([
	"save_contact_name",
	"save_contact_whatsapp",
	"search_groups",
	"recommend_groups",
	"get_rates",
	"get_group_details",
	"simulate_quota",
]);

export function isTurnEmpty(rec: TurnEmissionRecord): boolean {
	// Uma tool conta como emissão visível só se NÃO for interna (save_*/descoberta).
	// O visível da descoberta é o artifact/texto que ela leva a produzir (contado
	// à parte). Sem a lista de nomes (record legado), mantém o comportamento antigo
	// (toolCount>0 → não-vazio). FIX-172 + FIX-189.
	const hasVisibleTool = rec.toolsCalled
		? rec.toolsCalled.some((t) => !NON_VISIBLE_TOOLS.has(t))
		: rec.toolCount > 0;
	return rec.textChars === 0 && !hasVisibleTool && rec.artifactCount === 0 && !rec.handoff;
}
