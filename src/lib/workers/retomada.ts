// RETOMADA — quando o cliente falou (ou parou) e ninguém puxou a conversa.
//
// O watchdog anterior (`gate-reengage-poll`) só enxergava conversa com marcador
// de gate pendente, e por muito tempo foi cego para o defeito mais caro: o turno
// que RODOU, entregou cards e não conduziu — e o turno que simplesmente morreu
// no meio, sem escrever marcador nenhum. O gate saiu com o funil; a fonte que
// olha o estado OBSERVÁVEL (a última mensagem é do cliente, e faz tempo) ficou,
// e vive em `retomada-cycle.ts`.
//
// Aqui moram o directive e o anti-loop; o ciclo (query + disparo) importa daqui.
//
// A retomada é um TURNO DE SERVIDOR de verdade: entra no motor pelo mesmo
// caminho do directive (`isUserTurn: false`), passa pelos mesmos guards, pelo
// mesmo filtro e pelo mesmo `persist`. Não existe canal paralelo de texto
// enlatado — o que o agente diz continua sendo dele; o que o servidor faz é
// contar o FATO e pedir a intenção.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { artifacts, messages } from "@/db/schema";
import type { ChosenOffer } from "@/lib/agent/orchestrator/choose-offer";
import { listShownOffers } from "@/lib/agent/orchestrator/choose-offer";
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

/** O pouco que o directive precisa saber da oferta que está na mesa. */
export type OfertaDaRetomada = {
	administradora?: string;
	creditValue: number;
	monthlyPayment?: number;
};

/**
 * A oferta que o turno de retomada cita — o ponto onde a retomada ficava MUDA.
 *
 * `recommendedOffer` é o formato que o vendedor grava quando ancora uma carta
 * (`fazer_proposta`). Só que a maior parte das conversas que param não chegou ao
 * fecho: o cliente viu a comparação e sumiu. Nelas o campo não existe, e o
 * directive anunciava "ainda não viu nenhuma oferta" para quem tinha visto três.
 * Retomada que começa negando o que está na tela do cliente é pior que retomada
 * nenhuma.
 *
 * Por isso o segundo degrau é o que o cliente REALMENTE viu: os cards
 * persistidos (`artifacts`). Nada é fabricado — carta sem número real fica fora,
 * e sem nenhum dos dois a conversa segue sem oferta, declarando isso.
 */
export function escolherOfertaDaRetomada(
	meta: ConversationMetadata,
	cartasExibidas: readonly ChosenOffer[],
): OfertaDaRetomada | null {
	const gravada = meta.recommendedOffer;
	if (gravada && gravada.creditValue > 0) {
		return {
			administradora: gravada.administradora,
			creditValue: gravada.creditValue,
			monthlyPayment: gravada.monthlyPayment,
		};
	}
	// `cartasExibidas` vem da mais recente para a mais antiga: a primeira com
	// número real é a última que apareceu na tela.
	const vista = cartasExibidas.find((c) => (c.creditValue ?? 0) > 0);
	if (!vista?.creditValue) return null;
	return {
		administradora: vista.administradora,
		creditValue: vista.creditValue,
		monthlyPayment: vista.monthlyPayment,
	};
}

/** As cartas que o cliente viu nesta conversa, da mais recente para a mais antiga. */
async function cartasExibidasNaConversa(conversationId: string): Promise<ChosenOffer[]> {
	const rows = await db
		.select({ type: artifacts.type, payload: artifacts.payload })
		.from(artifacts)
		.innerJoin(messages, eq(artifacts.messageId, messages.id))
		.where(eq(messages.conversationId, conversationId))
		.orderBy(desc(messages.createdAt), desc(artifacts.createdAt));
	return listShownOffers(rows);
}

/** A oferta da retomada: a gravada pelo vendedor, ou a última carta da conversa. */
export async function resolverOfertaDaRetomada(
	conversationId: string,
	meta: ConversationMetadata,
): Promise<OfertaDaRetomada | null> {
	const gravada = escolherOfertaDaRetomada(meta, []);
	if (gravada) return gravada;
	const cartas = await cartasExibidasNaConversa(conversationId).catch((err: unknown) => {
		// Best-effort: sem a leitura o directive ainda sai — só sem a oferta.
		console.error("[retomada] cartas da conversa não lidas (seguindo sem oferta):", err);
		return [] as ChosenOffer[];
	});
	return escolherOfertaDaRetomada(meta, cartas);
}

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
	args: {
		minutosParado: number;
		channel: "web" | "whatsapp";
		/** Oferta JÁ RESOLVIDA (gravada ou última carta da conversa). Ausente =
		 * usa `meta.recommendedOffer`; `null` = a conversa não tem oferta. */
		oferta?: OfertaDaRetomada | null;
	},
): string {
	const partes: string[] = [
		"[instrução do sistema — o cliente NÃO vê este texto, não o repita]",
		`O cliente está há cerca de ${args.minutosParado} minutos sem responder.`,
	];

	const oferta = args.oferta === undefined ? meta.recommendedOffer : args.oferta;
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
