/**
 * ACOLHIDA N1 — o cliente entregue à mesa que voltou a escrever e não teve resposta.
 *
 * ## O caso
 *
 * Sexta 14/08, 19:02: a cliente fecha a proposta (ITAÚ, carta de R$ 211.258), é
 * entregue à mesa, escreve "Oi! Acabei de fechar minha proposta" — e recebe
 * silêncio. No WhatsApp o cliente nesse estado não recebe absolutamente nada
 * (`processor.ts` só faz relay ao atendente); na web recebe uma nota de sistema
 * seca, repetida a cada mensagem.
 *
 * ## O que este módulo NÃO conserta
 *
 * A mesa não ignorou ninguém. A notificação de handoff levou **42 minutos** para
 * ser `delivered` e **17h24** para ser `read` no WhatsApp do atendente, e o
 * painel estava sem nenhum listener conectado no instante do handoff. Isso é
 * campainha quebrada e tem conserto próprio. A acolhida é o que se diz ao
 * cliente enquanto isso — cobertor, não campainha. Vender isto como solução do
 * silêncio seria esconder o defeito real.
 *
 * ## Por que a decisão é PURA e re-checável
 *
 * O invariante de 2026-08-10 é que o agente não fala por cima de quem atende
 * (`quemRespondePara`, allowlist por pessoa). Um N1 inline no turno de inbound o
 * reintroduziria: a geração leva 3–8 s, e três das respostas reais da mesa
 * vieram em menos de 1 minuto — decidir em t₀ e emitir em t₀+7s pode falar
 * DEPOIS do humano, que é o dano pior. Por isso a decisão é uma função pura,
 * consultada pelo worker antes de gerar **e de novo imediatamente antes de
 * emitir**, dentro do lock.
 */

import type { ConversationMetadata } from "@/lib/agent/personas";

/**
 * Quanto tempo depois do inbound do cliente a acolhida pode sair.
 *
 * Deliberadamente CURTA, e deliberadamente não derivada dos tempos históricos: a
 * distribuição das respostas da mesa por rajada é bimodal (17, 1, 3, 1, 8, 53,
 * 1, 9, 69 min, mais um infinito), com um vazio entre 17 e 53 — qualquer corte
 * ali parte ao meio as duas únicas amostras frias e não tem lastro estatístico.
 * O que protege o invariante aqui não é o relógio: é a re-checagem do fato "a
 * mesa falou" dentro do lock. A grace só evita a acolhida atropelar um atendente
 * que já estava digitando quando a mensagem chegou.
 */
export const GRACE_ACOLHIDA_N1_MS = 3 * 60_000;

/** Teto de acolhidas por período. Mesma doutrina da retomada: duas é o limite
 * entre acolher e perseguir. */
export const MAX_ACOLHIDAS_N1 = 2;

/** Intervalo mínimo entre acolhidas — cobre o cliente que escreve várias vezes
 * ao longo de um fim de semana inteiro sem virar assédio. */
export const BACKOFF_ACOLHIDA_N1_MS = 6 * 60 * 60_000;

/** Prefixo das notas que o SERVIDOR grava no histórico do atendimento
 * (`proxy.ts`, no `/fim`). Elas entram como `assistant` sem persona, exatamente
 * como a fala do atendente — e por isso precisam ser excluídas na mão. */
const PREFIXO_NOTA_DE_SISTEMA = "[sistema]";

/**
 * Esta mensagem é fala de GENTE da mesa?
 *
 * O predicado ingênuo — `role='assistant' AND persona_id IS NULL` — casa também
 * com a nota `[sistema] Fulano encerrou o atendimento`. Um `/fim` de atendente
 * passaria a contar como "a mesa respondeu" e calaria o N1 para sempre naquela
 * conversa.
 */
export function ehFalaDaMesa(msg: {
	role: string;
	personaId?: string | null;
	content?: string | null;
}): boolean {
	if (msg.role !== "assistant") return false;
	if (msg.personaId) return false; // tem persona = falou o agente
	return !(msg.content ?? "").trimStart().startsWith(PREFIXO_NOTA_DE_SISTEMA);
}

export type MotivoDeNaoAcolher =
	| "sem-inbound"
	| "grace-window"
	| "mesa-respondeu"
	| "ja-acolhida"
	| "teto-atingido";

export type DecisaoDeAcolhida = { acolher: true } | { acolher: false; motivo: MotivoDeNaoAcolher };

/**
 * Acolher este cliente agora?
 *
 * Pura de propósito: é o mesmo cálculo antes de gerar e imediatamente antes de
 * emitir. `ultimaFalaDaMesaEm` tem que ser recarregado do banco na segunda
 * chamada — é ele que fecha a corrida.
 */
export function decidirAcolhidaN1(args: {
	meta: ConversationMetadata;
	agora: number;
	/** Quando o cliente falou pela última vez. `null` = não escreveu desde o handoff. */
	ultimoInboundDoClienteEm: number | null;
	/** Última fala HUMANA da mesa (ver `ehFalaDaMesa`). `null` = nunca respondeu. */
	ultimaFalaDaMesaEm: number | null;
	/** Existe proposta registrada na administradora para esta conversa. */
	temPropostaReal: boolean;
}): DecisaoDeAcolhida {
	const { meta, agora, ultimoInboundDoClienteEm, ultimaFalaDaMesaEm } = args;

	// Ninguém está esperando resposta: sem inbound, o silêncio não incomoda.
	if (ultimoInboundDoClienteEm === null) return { acolher: false, motivo: "sem-inbound" };

	// A mesa falou depois que o cliente escreveu — o humano está no caso, e o
	// agente não abre a boca. Este é o teste que fecha a corrida.
	if (ultimaFalaDaMesaEm !== null && ultimaFalaDaMesaEm >= ultimoInboundDoClienteEm) {
		return { acolher: false, motivo: "mesa-respondeu" };
	}

	if (agora - ultimoInboundDoClienteEm < GRACE_ACOLHIDA_N1_MS) {
		return { acolher: false, motivo: "grace-window" };
	}

	const jaFeitas = meta.acolhidaN1;
	if (jaFeitas) {
		if (jaFeitas.attempts >= MAX_ACOLHIDAS_N1) return { acolher: false, motivo: "teto-atingido" };
		if (agora - jaFeitas.lastAt < BACKOFF_ACOLHIDA_N1_MS) {
			return { acolher: false, motivo: "ja-acolhida" };
		}
	}

	return { acolher: true };
}

const brl = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/**
 * O directive da acolhida: FATO + INTENÇÃO, como o da retomada.
 *
 * O que o servidor conta é só o que ele SABE — que a conversa está com a mesa e
 * qual proposta está registrada. O que não entra, e por quê:
 *
 * - **Tempo de fila.** Havia handoffs abertos há 28h, 61h, 128h e 129h. "Você
 *   está esperando há 129 horas" é absurdo para quem já foi atendido, e o número
 *   nem é confiável (o handoff não é encerrado de verdade quando termina).
 * - **Prazo de retorno.** Não existe expediente cadastrado em lugar nenhum do
 *   código. Prometer "amanhã de manhã" é inventar dado — a primeira regra do
 *   projeto.
 * - **Nome de tool.** Foi assim que o agente perseguiu uma `search_groups` que o
 *   grafo não expõe e devolveu turno mudo.
 *
 * O texto continua sendo do modelo: o servidor informa o estado e a intenção do
 * turno, não a frase.
 */
export function buildAcolhidaN1Directive(
	meta: ConversationMetadata,
	args: {
		proposta: {
			administradora?: string | null;
			creditValue?: number | null;
			monthlyPayment?: number | null;
			termMonths?: number | null;
		} | null;
	},
): string {
	// O directive NÃO recebe o canal, e isso é a garantia de paridade: web e
	// WhatsApp são o mesmo cliente, no mesmo estado, esperando a mesma mesa. Toda
	// vez que este produto deixou o canal entrar numa regra, a regra virou duas —
	// e uma delas ficou para trás (dossiê de 2026-08-15, as sete costuras).
	const partes: string[] = [
		"[instrução do sistema — o cliente NÃO vê este texto, não o repita]",
		meta.contractClosed
			? "Este cliente JÁ FECHOU a contratação e o caso está com a mesa de atendimento, " +
				"que cuida dele a partir daqui. Ele voltou a escrever e ainda não foi atendido " +
				"por uma pessoa."
			: "Este cliente foi passado para a mesa de atendimento, que cuida do caso a partir " +
				"daqui. Ele voltou a escrever e ainda não foi atendido por uma pessoa.",
	];

	const p = args.proposta;
	if (p?.creditValue) {
		const parcela = p.monthlyPayment ? `, parcela de R$ ${brl(p.monthlyPayment)}` : "";
		const prazo = p.termMonths ? `, em ${p.termMonths} meses` : "";
		partes.push(
			`A proposta dele está registrada e é real: carta de R$ ${brl(p.creditValue)} da ` +
				`${p.administradora ?? "administradora"}${parcela}${prazo}. Pode confirmar que está tudo registrado.`,
		);
	} else {
		partes.push(
			"NÃO há proposta registrada no sistema para ele. Não afirme que existe, não " +
				"invente número e não descreva status de contratação.",
		);
	}

	partes.push(
		"Sua tarefa neste turno é SÓ acolher: reconheça a mensagem dele, no seu tom, e " +
			"deixe claro que a mesa vai continuar o atendimento. Uma mensagem curta. " +
			"NÃO retome a venda, não ofereça outra cota, não peça dados novos e não faça " +
			"pergunta de qualificação. NÃO diga há quanto tempo ele espera, NÃO prometa " +
			"horário nem prazo de retorno, e NÃO se comprometa em nome do atendente. " +
			"Se ele perguntou algo que você não sabe, diga que quem responde é a mesa.",
	);

	return partes.join(" ");
}
