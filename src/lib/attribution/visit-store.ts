// src/lib/attribution/visit-store.ts
//
// Persistência das visitas. Server-only (toca Postgres) — o middleware NÃO
// importa este módulo.
//
// Regra que atravessa o arquivo inteiro: atribuição nunca derruba a venda. Se
// gravar a origem falhar, o visitante continua navegando e o cliente continua
// conversando; perdemos a linha da campanha, não o lead. Por isso todo caminho
// aqui é best-effort com log — mas com log de verdade, nunca `catch {}` mudo.

import { and, desc, eq, gt, isNull, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, visits } from "@/db/schema";
import type { CampaignParams } from "./params";
import type { CtwaReferral } from "./referral";
import { parseVisitCookie } from "./visit-cookie";

/**
 * Janela pra casar um clique em anúncio Click-to-WhatsApp com a conversa que
 * ele originou. A Meta manda o `referral` junto da primeira mensagem, então na
 * prática a distância é de segundos; 24h é folga generosa pro caso de
 * reprocessamento de webhook, não uma aposta.
 */
const JANELA_CTWA_MS = 24 * 60 * 60 * 1000;

export interface WebVisitInput {
	visitId: string;
	visitorId: string;
	params: CampaignParams;
	/** `_fbp` do pixel, cru (a Meta exige sem hash). Nulo quando o pixel ainda
	 * não rodou — a primeira visita de um navegador chega antes do cookie. */
	fbp?: string | null;
	landingPath: string;
	referrer: string | null;
	userAgent: string | null;
}

/**
 * Grava a visita web decidida pelo middleware.
 *
 * O id vem de fora (o middleware já o carimbou no cookie) para que cookie e
 * linha do banco falem do mesmo objeto. `onConflictDoNothing` porque a mesma
 * visita pode chegar duas vezes — refresh, retry do Next, dupla renderização
 * em dev — e visita duplicada distorce toda taxa de conversão.
 */
export async function recordWebVisit(input: WebVisitInput): Promise<void> {
	try {
		await db
			.insert(visits)
			.values({
				id: input.visitId,
				visitorId: input.visitorId,
				channel: "web",
				landingPath: input.landingPath,
				referrer: input.referrer,
				utmSource: input.params.utmSource,
				utmMedium: input.params.utmMedium,
				utmCampaign: input.params.utmCampaign,
				utmContent: input.params.utmContent,
				utmTerm: input.params.utmTerm,
				gclid: input.params.gclid,
				fbclid: input.params.fbclid,
				fbp: input.fbp ?? null,
				userAgent: input.userAgent,
			})
			.onConflictDoNothing();
	} catch (err) {
		console.error("[attribution] falha ao gravar visita web:", err);
	}
}

/**
 * Grava a chegada por anúncio Click-to-WhatsApp. Chamada do webhook, na
 * primeira mensagem depois do clique — é a única vez que a Meta manda esses
 * campos. Devolve o id da visita (ou `null` se falhou).
 */
export async function recordWhatsAppVisit(
	waId: string,
	referral: CtwaReferral,
): Promise<string | null> {
	try {
		const [criada] = await db
			.insert(visits)
			.values({
				visitorId: waId,
				channel: "whatsapp",
				ctwaClid: referral.ctwaClid,
				ctwaSourceId: referral.sourceId,
				ctwaSourceUrl: referral.sourceUrl,
				ctwaSourceType: referral.sourceType,
				ctwaHeadline: referral.headline,
			})
			.returning({ id: visits.id });
		return criada?.id ?? null;
	} catch (err) {
		console.error("[attribution] falha ao gravar visita de Click-to-WhatsApp:", err);
		return null;
	}
}

/**
 * Acha a visita de anúncio que ainda não foi reivindicada por nenhuma conversa
 * deste número. Serve o descompasso natural do WhatsApp: o webhook grava a
 * visita e só depois o processador cria a conversa.
 *
 * "Ainda não reivindicada" é o que impede um segundo clique de roubar a
 * atribuição de uma conversa que já tem origem.
 */
export async function findUnclaimedWhatsAppVisit(
	waId: string,
	nowMs: number = Date.now(),
): Promise<string | null> {
	try {
		const [visita] = await db
			.select({ id: visits.id })
			.from(visits)
			.where(
				and(
					eq(visits.visitorId, waId),
					eq(visits.channel, "whatsapp"),
					gt(visits.createdAt, new Date(nowMs - JANELA_CTWA_MS)),
					notExists(
						db
							.select({ um: conversations.id })
							.from(conversations)
							.where(eq(conversations.visitId, visits.id)),
					),
				),
			)
			.orderBy(desc(visits.createdAt))
			.limit(1);

		return visita?.id ?? null;
	} catch (err) {
		console.error("[attribution] falha ao buscar visita de Click-to-WhatsApp:", err);
		return null;
	}
}

/**
 * Confirma que a visita existe antes de a conversa apontar pra ela.
 *
 * Parece paranoia, mas o cookie `aja_visit` sobrevive a um reset da base: sem
 * esta checagem, o primeiro cliente a voltar depois do marco zero levaria um
 * erro de chave estrangeira no meio do chat — a atribuição derrubaria a venda,
 * exatamente o que este módulo promete nunca fazer.
 */
export async function visitExists(visitId: string): Promise<boolean> {
	try {
		const [achada] = await db
			.select({ id: visits.id })
			.from(visits)
			.where(eq(visits.id, visitId))
			.limit(1);
		return achada !== undefined;
	} catch (err) {
		console.error("[attribution] falha ao verificar visita:", err);
		return false;
	}
}

/**
 * Traduz o cookie `aja_visit` na visita que pode ser gravada numa conversa
 * nova. Devolve `null` pra cookie ausente, corrompido ou apontando pra visita
 * que não existe mais.
 *
 * Vive aqui, e não dentro da rota do chat, pra que este caminho — o lado web
 * da corrente visita → conversa → lead — tenha teste próprio contra banco de
 * verdade.
 */
export async function resolveVisitIdFromCookie(
	rawCookie: string | null | undefined,
): Promise<string | null> {
	const cookie = parseVisitCookie(rawCookie);
	if (!cookie) return null;
	return (await visitExists(cookie.visitId)) ? cookie.visitId : null;
}

/**
 * Quanto tempo depois de sair do site um código de origem ainda vale.
 *
 * O caminho real é de segundos — a pessoa toca no botão flutuante e o WhatsApp
 * abre com a fala já escrita. A folga de 24h cobre quem tocou, foi fazer outra
 * coisa e só apertou enviar depois; passou disso, a chegada é OUTRA e amarrá-la
 * à visita antiga daria crédito ao criativo errado.
 */
const JANELA_CODIGO_DE_ORIGEM_MS = 24 * 60 * 60 * 1000;

/**
 * A visita web por trás de um código de origem (A3).
 *
 * O código é o prefixo do próprio UUID (ver `codigo-de-origem.ts`), então a
 * busca é por prefixo — servida pelo índice de expressão
 * `visits_codigo_de_origem_idx`. Sem ele isto seria varredura de tabela em cima
 * do caminho quente do webhook.
 *
 * Devolve a MAIS RECENTE dentro da janela: em 32 bits de código, duas visitas
 * iguais são improváveis, e quando acontecer é a chegada de agora que descreve
 * como a pessoa chegou agora.
 *
 * Só visita `web`: o código nasce no site. Aceitar `whatsapp` aqui deixaria uma
 * conversa de WhatsApp reivindicar a visita de outra conversa de WhatsApp.
 */
export async function resolverVisitaPorCodigo(
	codigo: string,
	nowMs: number = Date.now(),
): Promise<string | null> {
	try {
		const [visita] = await db
			.select({ id: visits.id })
			.from(visits)
			.where(
				and(
					sql`left(${visits.id}::text, 8) = ${codigo.toLowerCase()}`,
					eq(visits.channel, "web"),
					gt(visits.createdAt, new Date(nowMs - JANELA_CODIGO_DE_ORIGEM_MS)),
				),
			)
			.orderBy(desc(visits.createdAt))
			.limit(1);

		return visita?.id ?? null;
	} catch (err) {
		console.error("[attribution] falha ao resolver código de origem:", err);
		return null;
	}
}

/**
 * Completa o `_fbp` de uma visita que nasceu sem ele (item B2).
 *
 * O proxy lê `_fbp` do cookie da requisição, e na PRIMEIRA chegada de um
 * navegador ele ainda não existe — quem o grava é o pixel, depois que a página
 * carregou. Como quase todo tráfego pago é primeira chegada, o campo ficava
 * nulo justamente onde ele vale: medido em produção em 30/08/2026, **683 de
 * 46.135 visitas com `fbp` (1,5%)**, e 2 dos 42 eventos de conversão já
 * enviados.
 *
 * `fbp` é o que diz à Meta "é o mesmo aparelho" — o `fbclid`/`fbc` diz de qual
 * anúncio a pessoa veio, e ela usa os dois. Sem ele o evento é aceito e casado
 * com quase ninguém, que é a metade NOSSA da nota de Event Match Quality.
 *
 * Só preenche quando está nulo: um `_fbp` mais novo chegando depois não pode
 * reescrever o que a visita registrou na hora, senão o evento passaria a
 * afirmar um aparelho diferente do que de fato originou a conversão.
 *
 * O formato é validado porque o valor vem do CORPO de um endpoint público:
 * `fb.<subdomain_index>.<timestamp>.<random>` é o que a Meta define, e o que
 * não bate seria lixo enviado como identidade.
 */
export async function completarFbpDaVisita(visitId: string, fbp: string): Promise<void> {
	if (!/^fb\.\d+\.\d+\.\d+$/.test(fbp)) return;

	try {
		await db
			.update(visits)
			.set({ fbp })
			.where(and(eq(visits.id, visitId), isNull(visits.fbp)));
	} catch (err) {
		console.error("[attribution] falha ao completar _fbp da visita:", err);
	}
}
