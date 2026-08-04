import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { hasCampaignSignal, parseCampaignParams } from "@/lib/attribution/params";
import {
	decideVisit,
	newVisitorId,
	VISIT_COOKIE,
	VISIT_COOKIE_MAX_AGE_SECONDS,
	VISITOR_COOKIE,
	VISITOR_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/attribution/visit-cookie";
import { recordWebVisit } from "@/lib/attribution/visit-store";
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
		const session = await auth.api.getSession({
			headers: await headers(),
		});

		if (!session) {
			return NextResponse.redirect(new URL("/admin/login", request.url));
		}
	}

	if (pathname === "/") {
		return registrarVisita(request);
	}

	return NextResponse.next();
}

/**
 * Registra a chegada à landing — origem de mídia gravada NO SERVIDOR.
 *
 * Fica no proxy, e não num pixel de navegador, porque pixel perde de 20% a 30%
 * do tráfego pra bloqueador de anúncio e JS desligado — e o que se perde não é
 * aleatório: some justo o visitante mais protegido. Aqui ou a pessoa recebe a
 * página e a visita existe, ou nenhum dos dois acontece.
 *
 * O proxy é o lugar certo por dois motivos: roda SEMPRE (mesmo com a landing
 * servida do cache estático, que continua estática) e roda em Node.js — é o
 * único ponto do fluxo de entrada que alcança o Postgres e ainda pode gravar
 * cookie na resposta.
 */
async function registrarVisita(request: NextRequest): Promise<NextResponse> {
	const response = NextResponse.next();

	// Prefetch e navegação RSC não são chegada de gente: contá-las inflaria o
	// denominador de toda taxa de conversão da dashboard.
	if (
		request.headers.get("next-router-prefetch") !== null ||
		request.headers.get("purpose") === "prefetch" ||
		request.headers.get("rsc") !== null
	) {
		return response;
	}

	const agora = Date.now();
	const campanha = parseCampaignParams(request.nextUrl.searchParams);

	// Visitante (device). Criado já na primeira chegada — antes só nascia no
	// primeiro POST /api/chat, então quem visitava e ia embora era invisível.
	const visitorAtual = request.cookies.get(VISITOR_COOKIE)?.value;
	const visitorId = visitorAtual ?? newVisitorId();

	const visita = decideVisit({
		rawCookie: request.cookies.get(VISIT_COOKIE)?.value,
		hasCampaign: hasCampaignSignal(campanha),
		nowMs: agora,
	});

	if (visita.isNew) {
		// Com `await`: sem ele o cliente poderia abrir o chat antes de a visita
		// existir, e a conversa nasceria órfã de origem. `recordWebVisit` nunca
		// lança — atribuição não derruba a venda.
		await recordWebVisit({
			visitId: visita.visitId,
			visitorId,
			params: campanha,
			landingPath: request.nextUrl.pathname,
			referrer: request.headers.get("referer"),
			userAgent: request.headers.get("user-agent"),
		});
	}

	// `sameSite: lax` é obrigatório: o visitante chega de um domínio de terceiro
	// (facebook.com, google.com). Com `strict` o cookie não viajaria na navegação
	// de entrada e toda visita paga pareceria visitante novo.
	const opcoesCookie = {
		httpOnly: true,
		sameSite: "lax",
		path: "/",
		secure: process.env.NODE_ENV === "production",
	} as const;

	if (!visitorAtual) {
		response.cookies.set(VISITOR_COOKIE, visitorId, {
			...opcoesCookie,
			maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
		});
	}
	response.cookies.set(VISIT_COOKIE, visita.cookieValue, {
		...opcoesCookie,
		maxAge: VISIT_COOKIE_MAX_AGE_SECONDS,
	});

	return response;
}

export const config = {
	matcher: ["/", "/admin", "/admin/((?!login).*)"],
};
