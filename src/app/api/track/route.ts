// POST /api/track — ingestão dos eventos do mapa de calor.
//
// Endpoint público e sem sessão, chamado por `sendBeacon` da landing. Três
// consequências que moldam o arquivo inteiro:
//
// 1. `sendBeacon` não lê resposta e não repete. Então a rota responde 204 seco e
//    rápido, e NUNCA usa o corpo pra falar com o cliente — não há quem ouça.
// 2. Qualquer um pode dar POST aqui. O que entra passa por allowlist
//    (`normalizeLote`) e por rate limit por IP.
// 3. Analytics não pode derrubar navegação. Erro de banco vira log e 204 — o
//    visitante nunca vê defeito porque o mapa de calor falhou.

import type { NextRequest } from "next/server";
import { ehRoboDeclarado } from "@/lib/attribution/user-agent-robo";
import { VISIT_COOKIE } from "@/lib/attribution/visit-cookie";
import { resolveVisitIdFromCookie } from "@/lib/attribution/visit-store";
import { marcarRageClicks, normalizeLote } from "@/lib/heatmap/events";
import { recordPageEvents } from "@/lib/heatmap/store";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

/**
 * Teto mais alto que o padrão de 10/min: o coletor manda um lote a cada poucos
 * segundos durante a leitura, e escritório atrás de NAT compartilha um IP só.
 * Apertado demais aqui, o mapa fica com buraco justamente no visitante engajado.
 */
const LIMITE_TRACK = { maxTokens: 60, refillRate: 60, windowMs: 60_000 };

/** 204 seco — `sendBeacon` descarta o corpo de qualquer jeito. */
const SEM_CONTEUDO = new Response(null, { status: 204 });

export async function POST(req: NextRequest) {
	// Robô declarado não entra: de 40.796 visitas medidas em produção, 38.792
	// eram máquina (ver `user-agent-robo.ts`). Sem este corte, o health-check do
	// ALB desenharia um mapa de calor de si mesmo.
	if (ehRoboDeclarado(req.headers.get("user-agent"))) return SEM_CONTEUDO;

	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		req.headers.get("x-real-ip") ??
		"unknown";

	if (!checkRateLimit(ip, LIMITE_TRACK).allowed) {
		return new Response(null, { status: 429 });
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return SEM_CONTEUDO;
	}

	const eventos = normalizeLote((body as { events?: unknown })?.events);
	if (eventos.length === 0) return SEM_CONTEUDO;

	// A visita pode não existir (cookie de antes de um reset da base, ou primeira
	// carga antes do proxy carimbar). O evento entra anônimo em vez de ser
	// descartado: pro total do mapa ele conta igual, só não cruza com campanha.
	const visitId = await resolveVisitIdFromCookie(req.cookies.get(VISIT_COOKIE)?.value);

	await recordPageEvents(marcarRageClicks(eventos), visitId);

	return SEM_CONTEUDO;
}
