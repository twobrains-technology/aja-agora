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

/** FIX-211 — oferta de SAÍDA pro especialista após o teto de cobranças. Anti-
 * armadilha: nunca loop infinito de re-pedido. Só oferece (o handoff real acontece
 * quando o usuário pede); sem emoji, sem hedge. */
export const SPECIALIST_EXIT_OFFER =
	"Se preferir, posso te conectar com um especialista pra te ajudar antes de seguir. É só me pedir.";

/**
 * Gate de ENTREGA OBRIGATÓRIA no WhatsApp: COLLECTION_GATES (credit/lance/...) +
 * `identify`. É a classe que o guard re-cobra em vez de deixar o funil parado.
 */
export function isMandatoryCollectionGate(gate: Gate): boolean {
	return COLLECTION_GATES.has(gate) || gate === "identify";
}

/**
 * FIX-208 (guard de turno-mudo) + FIX-211 (ESCADA de cobrança). Quando um gate de
 * COLETA obrigatória (credit/lance/.../identify) segue pendente — porque o turno
 * fechou mudo OU o usuário desviou —, re-cobramos o dado em vez de seguir sem ele.
 * A cobrança ESCALA por tentativa e, no teto, oferece a saída pro especialista:
 *   - attempt 1: pedido direto (a pergunta base do gate — compat com o guard mudo);
 *   - attempt 2: incentivo curto ("só falta isso, é rapidinho");
 *   - attempt 3: reforço de segurança ("é seguro e sem compromisso");
 *   - attempt >= 4: SPECIALIST_EXIT_OFFER (saída, não re-pergunta).
 * Gates fora da coleta obrigatória → null (mantêm o fallback honesto do adapter).
 */
export function reengageQuestionForGate(
	gate: Gate,
	category: Category | null | undefined,
	attempt = 1,
	// FIX-245: carta real (pós-reveal) no lugar do exemplo genérico na
	// educação de lance embutido, quando o chamador já tem o snapshot.
	creditValue?: number,
	// FIX-284: valor mencionado no gate `desire` — repassado pro
	// gateQuestion("credit", ...) pra a re-cobrança também confirmar em vez
	// de perguntar do zero.
	creditMentionedAtDesire?: number,
): string | null {
	if (!isMandatoryCollectionGate(gate)) return null;
	if (attempt >= 4) return SPECIALIST_EXIT_OFFER;
	const base = gateQuestion(gate, category ?? null, creditValue, undefined, creditMentionedAtDesire);
	if (!base) return null;
	if (attempt <= 1) return base;
	if (attempt === 2) return `${base}\n\nSó falta isso pra eu seguir — é rapidinho.`;
	return `${base}\n\nÉ seguro e sem compromisso. Só preciso disso pra continuar.`;
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
