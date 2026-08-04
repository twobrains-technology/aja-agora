// src/lib/attribution/visit-store.ts
//
// Persistência das visitas. Server-only (toca Postgres) — o middleware NÃO
// importa este módulo.
//
// Regra que atravessa o arquivo inteiro: atribuição nunca derruba a venda. Se
// gravar a origem falhar, o visitante continua navegando e o cliente continua
// conversando; perdemos a linha da campanha, não o lead. Por isso todo caminho
// aqui é best-effort com log — mas com log de verdade, nunca `catch {}` mudo.

import { and, desc, eq, gt, notExists } from "drizzle-orm";
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
