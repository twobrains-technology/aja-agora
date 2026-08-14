// RETOMADA — quando o cliente falou (ou parou) e ninguém puxou a conversa.
//
// O watchdog que já existia (`gate-reengage-poll`) só enxerga conversa com
// marcador de gate pendente, e por muito tempo ele foi cego para o defeito mais
// caro: o turno que RODOU, entregou cards e não conduziu — e o turno que
// simplesmente morreu no meio, sem escrever marcador nenhum.
//
// A retomada é um TURNO DE SERVIDOR de verdade: entra no grafo pelo mesmo
// caminho do directive (`isUserTurn: false`), passa pelos mesmos guards, pelo
// mesmo filtro e pelo mesmo `persist`. Não existe canal paralelo de texto
// enlatado — o que o agente diz continua sendo dele; o que o servidor faz é
// contar o FATO e pedir a intenção.
import type { ConversationMetadata } from "@/lib/agent/personas";

/** Teto de retomadas por período de silêncio. Duas é o limite entre "puxar a
 * conversa" e "perseguir quem já foi embora" — depois disso o silêncio é
 * resposta. */
export const MAX_RETOMADAS = 2;
/** Intervalo mínimo entre a 1ª e a 2ª retomada. */
export const BACKOFF_RETOMADA_MS = 30 * 60_000;

/**
 * Pode retomar esta conversa agora?
 *
 * O contador é gravado ANTES do disparo (ver o ciclo do worker), de propósito:
 * se o turno de retomada morrer no meio, a tentativa continua contada. Um
 * watchdog que só conta sucesso vira loop justamente na conversa que está
 * quebrando — o defeito perseguiria o cliente.
 */
export function podeRetomar(meta: ConversationMetadata, agora: number): boolean {
	const r = meta.retomada;
	if (!r) return true;
	if (r.attempts >= MAX_RETOMADAS) return false;
	return agora - r.lastAt >= BACKOFF_RETOMADA_MS;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

/**
 * O directive da retomada: FATO + INTENÇÃO, nunca passo a passo.
 *
 * Nome de tool não entra aqui — foi assim que o agente acabou perseguindo uma
 * `search_groups` que não existe no grafo e entregando um turno mudo (sessão
 * `ff8f2080`). Sequência ditada também não: a conversa é do modelo; o servidor
 * só informa onde ela parou e o que se espera deste turno.
 */
export function buildRetomadaDirective(
	meta: ConversationMetadata,
	args: { minutosParado: number; channel: "web" | "whatsapp" },
): string {
	const partes: string[] = [
		"[instrução do sistema — o cliente NÃO vê este texto, não o repita]",
		`O cliente está há cerca de ${args.minutosParado} minutos sem responder.`,
	];

	const oferta = meta.recommendedOffer;
	if (oferta?.creditValue) {
		const parcela = oferta.monthlyPayment ? `, parcela de R$ ${brl(oferta.monthlyPayment)}` : "";
		partes.push(
			`O que está na mesa: carta de R$ ${brl(oferta.creditValue)} da ${oferta.administradora ?? "administradora"}${parcela}, já apresentada a ele.`,
		);
	} else {
		partes.push("Ele ainda não viu nenhuma oferta — a conversa parou antes disso.");
	}

	// A parcela declarada é o dado que mais costuma explicar o silêncio: ele viu
	// um número acima do que disse que pagava e travou.
	const alvo = meta.qualifyAnswers?.parcelaAlvo;
	if (alvo && oferta?.monthlyPayment && oferta.monthlyPayment > alvo) {
		partes.push(
			`Atenção: a parcela apresentada está ACIMA dos R$ ${brl(alvo)} por mês que ele declarou — pode ser exatamente o motivo do silêncio.`,
		);
	}

	partes.push(
		"Retome a conversa em UMA mensagem curta: reconheça onde ela parou, no seu tom, " +
			"e termine com UMA pergunta. Não repita o que já foi dito, não peça desculpas pela " +
			"demora e não prometa retorno futuro.",
	);
	return partes.join(" ");
}
