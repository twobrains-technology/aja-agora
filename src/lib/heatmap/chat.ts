// src/lib/heatmap/chat.ts
//
// O comportamento DENTRO da conversa — a metade do produto que não tinha sinal
// nenhum até 18/08/2026.
//
// O que existia era o funil: `conversations`, `messages`, `maxStageReached`.
// Tudo isso só começa a existir depois que a pessoa ESCREVE, porque a conversa
// nasce no primeiro `POST /api/chat`. Quem abria o teatro pelo "Fale com a AJA",
// olhava o palco vazio e fechava não deixava rastro em lugar nenhum do sistema —
// e no primeiro dia de mapa de calor essa faixa apareceu grande: das 34 pessoas
// medidas, 20 nem rolaram a página.
//
// Cada função aqui responde a uma pergunta que o funil não alcança:
//
// | evento            | pergunta                                                  |
// |-------------------|-----------------------------------------------------------|
// | `chat_open`       | de qual CTA vem quem conversa                             |
// | `chat_typing`     | quanto tempo hesitou antes da primeira tecla              |
// | `chat_send`       | quanto levou pra primeira palavra, e pra cada resposta    |
// | `chat_receive`    | quanto ESPEROU o agente — a causa mais provável de abandono|
// | `chat_card_click` | o que tocou, incluindo card que ninguém aperta            |
// | `chat_close`      | como desistiu: X, scrim ou Esc                            |
//
// O `at` de cada evento é injetável nos testes; em produção é sempre `Date.now`.
// Os marcos vivem em módulo e não em React state de propósito: o teatro remonta
// e o provider re-renderiza, e um marco que morresse junto zeraria a medição no
// meio da sessão.

import { enfileirar } from "./fila";

/** Como o teatro foi semeado: texto digitado na landing, chip de categoria, ou nada. */
export type SementeDeChat = "digitada" | "chip" | "vazia";

/** Por onde a pessoa saiu. Três desistências diferentes, e o painel precisa distingui-las. */
export type SaidaDeChat = "x" | "scrim" | "esc";

interface SessaoDeChat {
	abertaEm: number;
	jaDigitou: boolean;
	jaEnviou: boolean;
	/** Instante do último envio — a âncora da espera de `chat_receive`. */
	enviadoEm: number | null;
	/** Instante da última resposta — a âncora do tempo de reação do próximo envio. */
	recebidoEm: number | null;
	conversationId: string | null;
}

let sessao: SessaoDeChat | null = null;

/**
 * Emite um evento da sessão corrente.
 *
 * Fora de sessão não emite nada: um `chat_focus` sem abertura mediria tempo a
 * partir do nada, e um `chat_close` órfão contaria uma desistência que não
 * aconteceu.
 */
function emitir(evento: Record<string, unknown>): void {
	if (!sessao) return;

	enfileirar({
		...evento,
		...(sessao.conversationId ? { conversationId: sessao.conversationId } : {}),
	});
}

/**
 * O teatro montou.
 *
 * `secao` é a seção da landing de onde partiu o clique — é o que liga o mapa de
 * calor ao funil pela ponta que interessa ("o CTA do rodapé converte melhor que
 * o do hero?"). Chega null quando a abertura não veio de um CTA marcado.
 */
export function chatAbriu(
	args: { secao?: string | null; seed: SementeDeChat; conversationId?: string | null },
	agora: number = Date.now(),
): void {
	sessao = {
		abertaEm: agora,
		jaDigitou: false,
		jaEnviou: false,
		enviadoEm: null,
		recebidoEm: null,
		conversationId: args.conversationId ?? null,
	};

	emitir({ type: "chat_open", section: args.secao ?? null, label: args.seed });
}

/**
 * A conversa passou a existir (ou foi reconhecida na retomada).
 *
 * Daqui pra frente todo evento da sessão aponta pra ela. Os anteriores ficam sem
 * — e devem ficar: eles são o registro de quem esteve aqui ANTES de existir
 * conversa, que é o caso que esta instrumentação foi feita para enxergar.
 */
export function chatConversaConhecida(conversationId: string | null): void {
	if (!sessao || !conversationId) return;
	sessao.conversationId = conversationId;
}

/**
 * A pessoa encostou no teclado pela primeira vez nesta sessão.
 *
 * É a primeira TECLA, e não o foco: o campo se auto-foca quando o teatro abre
 * (`chat-input.tsx` devolve o foco a cada fim de streaming também), então medir
 * foco daria zero para todo mundo e apagaria justamente a hesitação que
 * interessa. Repetição não conta — o que se quer é o tempo até a decisão de
 * falar, não o ritmo de digitação.
 */
export function chatDigitou(agora: number = Date.now()): void {
	if (!sessao || sessao.jaDigitou) return;
	sessao.jaDigitou = true;

	emitir({ type: "chat_typing", duracaoMs: agora - sessao.abertaEm });
}

/**
 * Mensagem enviada.
 *
 * A duração muda de significado no primeiro envio: ali ela é a espera desde a
 * abertura (quanto tempo o palco vazio segurou a pessoa). Depois passa a ser o
 * tempo de reação ao que o agente disse — contar desde a abertura mediria a
 * idade da sessão, que não é decisão de ninguém.
 */
export function chatEnviou(agora: number = Date.now()): void {
	if (!sessao) return;

	const desde = sessao.jaEnviou ? (sessao.recebidoEm ?? sessao.enviadoEm) : sessao.abertaEm;
	sessao.jaEnviou = true;
	sessao.enviadoEm = agora;

	emitir({ type: "chat_send", duracaoMs: desde === null ? null : agora - desde });
}

/**
 * A primeira palavra do agente chegou à tela.
 *
 * É a espera SENTIDA, e por isso é marcada no primeiro token e não no fim do
 * turno: quem desiste, desiste olhando para o silêncio, não para o parágrafo
 * completo.
 */
export function chatRecebeu(agora: number = Date.now()): void {
	if (!sessao) return;

	const desde = sessao.enviadoEm;
	sessao.recebidoEm = agora;

	emitir({ type: "chat_receive", duracaoMs: desde === null ? null : agora - desde });
}

/** Toque em qualquer coisa dentro do teatro. Sem coordenada — ver `TIPOS_EVENTO`. */
export function chatTocou(
	alvo: { selector: string | null; label: string },
	_agora: number = Date.now(),
): void {
	emitir({ type: "chat_card_click", selector: alvo.selector, label: alvo.label });
}

/** Fechou. Encerra a sessão: o próximo `chatAbriu` começa do zero. */
export function chatFechou(saida: SaidaDeChat, agora: number = Date.now()): void {
	if (!sessao) return;

	emitir({ type: "chat_close", label: saida, duracaoMs: agora - sessao.abertaEm });
	sessao = null;
}

/** A conversa desta sessão, pra quem precisa carimbar evento de fora. */
export function conversaDaSessao(): string | null {
	return sessao?.conversationId ?? null;
}

/** Só pra teste. */
export function resetarSessaoDeChat(): void {
	sessao = null;
}
