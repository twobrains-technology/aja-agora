// FIX-207 — watchdog de inatividade do funil (decisão pura).
//
// Rede de segurança pra CAUDA não-determinística do FIX-206: quando o LLM
// classifica um turno de texto como pergunta/dúvida, `decideShowGate` suprime o
// próximo gate LEGITIMAMENTE (o agente respondeu conversacionalmente) — mas se o
// usuário fica parado, o funil não re-abre sozinho. Este módulo decide, de forma
// PURA e determinística (timestamps + estado), quando marcar a pendência e quando
// re-engajar. Espelha `isStreamStuck` (chat/stream-watchdog.ts). O worker
// (workers/gate-reengage-poll.ts) só arma o ciclo recorrente.

import { gateQuestion } from "./orchestrator/gate-questions";
import type { Category, ConversationMetadata } from "./personas";
import { COLLECTION_GATES, type Gate, nextGate } from "./qualify-state";

/**
 * Teto de inatividade antes de re-engajar o funil parado num gate pendente.
 * Generoso de propósito (padrão 90s): acima de qualquer turno real (SLA < 3s) e
 * de quem está digitando devagar, mas finito — nunca "preso pra sempre". Espelha
 * a filosofia do STREAM_STALL_TIMEOUT_MS (45s) — este é maior porque mede
 * inatividade HUMANA (o usuário lendo/pensando), não um stream técnico morto.
 */
export const GATE_REENGAGE_TIMEOUT_MS = Number(process.env.GATE_REENGAGE_TIMEOUT_MS ?? 90_000);

/**
 * Gates que NÃO são re-engajados pelo watchdog:
 * - `doubts-wait`: espera legítima (o agente fez uma pergunta e aguarda resposta);
 * - `search`: terminal — a busca/reveal é dirigida por directive do orquestrador;
 * - `decision`: pós-reveal, também dirigido por directive (não por fireGate);
 * - `name`: 1º contato, pedido pelo texto do directive de abertura (sem card WA).
 *
 * O watchdog só reabre os gates da QUALIFICAÇÃO que `fireGate` sabe disparar
 * (experience/consent/identify/credit/lance/…) — a classe de trava do FIX-206.
 */
export const NON_REENGAGE_GATES: ReadonlySet<Gate> = new Set<Gate>([
	"doubts-wait",
	"search",
	"decision",
	"name",
]);

/**
 * Estados em que o watchdog NUNCA re-engaja: handoff humano pendente, fechamento
 * concluído, ou coleta de lead ativa (o fluxo é dirigido por outro mecanismo). O
 * status da conversa (handed_off/closed) é filtrado pelo worker via query; aqui
 * cobrimos os flags do meta.
 */
export function isConversationPausedOrTerminal(meta: ConversationMetadata): boolean {
	return Boolean(meta.handoffSuggested || meta.contractClosed || meta.leadCollection);
}

/**
 * Ao fim de um turno de USUÁRIO, decide se o funil ficou com um gate REAL pendente
 * porém suprimido (nenhum card disparado) — o que deixaria a conversa parada até o
 * usuário voltar a falar. Retorna o gate a gravar em `pendingGate`, ou null (nada
 * a re-engajar). Server-authored já avança (FIX-206); estados terminais/pausados e
 * gates não-re-engajáveis nunca marcam.
 */
export function pendingGateAfterTurn(args: {
	meta: ConversationMetadata;
	gateFired: boolean;
	isUserTurn: boolean;
	hasContactName: boolean;
}): Gate | null {
	const { meta, gateFired, isUserTurn, hasContactName } = args;
	if (!isUserTurn) return null;
	if (gateFired) return null;
	if (isConversationPausedOrTerminal(meta)) return null;
	const gate = nextGate(meta, { hasContactName });
	if (NON_REENGAGE_GATES.has(gate)) return null;
	return gate;
}

/**
 * FIX-208 — guard de turno-mudo (rede final). Quando um turno de USUÁRIO fecharia
 * MUDO (nenhuma emissão visível) com um gate de COLETA pendente (o usuário
 * respondeu o valor/lance e nada saiu), os adapters (route.ts web +
 * whatsapp/adapter.ts) re-emitem a PERGUNTA daquele gate em vez do
 * EMPTY_TURN_FALLBACK ("Acho que me perdi..."). Retorna a pergunta re-emitível, ou
 * null (→ cai no fallback honesto). Restrito à MESMA classe do decideShowGate
 * (COLLECTION_GATES: credit/lance/lance-value/lance-embutido) — os demais gates
 * (experience/consent/identify/name/search/decision) mantêm o fallback honesto.
 */
export function reengageQuestionForGate(
	gate: Gate,
	category: Category | null | undefined,
): string | null {
	// COLLECTION_GATES (credit/lance/...) + `identify`: gates de ENTREGA OBRIGATÓRIA
	// no WhatsApp — o guard re-pergunta a pergunta do gate em vez do "me perdi".
	// identify não é "collection" mas é entrega obrigatória (FIX-53); sem ele aqui o
	// consent→identify caía no fallback honesto (bug de prod 2026-07-02).
	if (!COLLECTION_GATES.has(gate) && gate !== "identify") return null;
	return gateQuestion(gate, category ?? null);
}

/**
 * Decide se uma conversa parada deve ser re-engajada AGORA. Espelho de
 * `isStreamStuck`: pendência marcada + tempo além do teto + estado não-terminal.
 */
export function shouldReengageGate(opts: {
	meta: ConversationMetadata;
	/** epoch ms de quando o gate ficou pendente (ConversationMetadata.pendingGateSince). */
	pendingGateSince: number | undefined;
	/** epoch ms "agora" (injetado pelo ciclo — determinístico, sem Date.now()). */
	now: number;
	timeoutMs?: number;
}): boolean {
	const { meta, pendingGateSince, now } = opts;
	if (pendingGateSince === undefined) return false;
	if (isConversationPausedOrTerminal(meta)) return false;
	const limit = opts.timeoutMs ?? GATE_REENGAGE_TIMEOUT_MS;
	return now - pendingGateSince >= limit;
}
