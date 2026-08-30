// POST /api/track/chat-iniciado — o lado servidor do evento de início de
// conversa (item B3 do plano de 30/08/2026).
//
// Rota própria, e não mais um tipo dentro de `/api/track`, por três motivos que
// não são de estilo:
//
//  1. `/api/track` alimenta o mapa de calor — um sistema de LEITURA nosso, cujo
//     pior defeito é um gráfico torto. Isto aqui alimenta o algoritmo que
//     decide onde a verba da campanha é gasta. Erro aqui custa dinheiro, e os
//     dois merecem log, erro e teste separados.
//  2. O corpo é outro: o mapa de calor recebe LOTES de eventos normalizados por
//     allowlist; aqui é um evento só, com um id que precisa casar exatamente
//     com o que o pixel mandou.
//  3. `/api/track` responde 204 seco porque `sendBeacon` descarta o corpo. Este
//     também responde 204 — mas por decisão própria, não por herança.
//
// Endpoint público e sem sessão, como o irmão: o que protege é o rate limit por
// IP e o fato de o pior abuso possível ser inflar um sinal de mídia (o índice
// único da `event_key` já barra a repetição do MESMO evento).

import type { NextRequest } from "next/server";
import { ehRoboDeclarado } from "@/lib/attribution/user-agent-robo";
import { VISIT_COOKIE } from "@/lib/attribution/visit-cookie";
import { resolveVisitIdFromCookie } from "@/lib/attribution/visit-store";
import { registrarInicioDeConversa } from "@/lib/conversions/inicio-de-conversa";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

/**
 * Teto baixo de propósito: uma pessoa abre o teatro um punhado de vezes por
 * sessão. Sessenta por minuto, como o mapa de calor, seria janela para inflar
 * o sinal que a campanha usa para aprender.
 */
const LIMITE = { maxTokens: 12, refillRate: 12, windowMs: 60_000 };

const SEM_CONTEUDO = new Response(null, { status: 204 });

/** UUID v4 — o formato que `crypto.randomUUID()` produz no cliente. */
const EVENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
	if (ehRoboDeclarado(req.headers.get("user-agent"))) return SEM_CONTEUDO;

	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown";

	if (!checkRateLimit(ip, LIMITE).allowed) {
		return new Response(null, { status: 429 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return SEM_CONTEUDO;
	}

	const { eventId, conversationId } = (body ?? {}) as {
		eventId?: unknown;
		conversationId?: unknown;
	};

	// Formato validado, e não só presença: o `eventId` vira `event_id` na Meta e
	// é a única coisa que impede o mesmo início de conversa de ser contado duas
	// vezes (pixel + CAPI). String arbitrária aqui poderia colidir com a chave de
	// um marco de venda, e o índice único descartaria a VENDA em silêncio.
	if (typeof eventId !== "string" || !EVENT_ID_RE.test(eventId)) return SEM_CONTEUDO;

	// A visita vem do cookie, nunca do corpo: quem manda o beacon é a mesma
	// página que carrega o cookie, e aceitar um `visitId` do cliente deixaria
	// qualquer um atribuir conversa a qualquer campanha.
	const visitId = await resolveVisitIdFromCookie(req.cookies.get(VISIT_COOKIE)?.value);

	await registrarInicioDeConversa({
		eventId,
		visitId,
		conversationId:
			typeof conversationId === "string" && EVENT_ID_RE.test(conversationId)
				? conversationId
				: null,
	});

	return SEM_CONTEUDO;
}
