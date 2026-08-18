import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { contaDesativada } from "@/lib/admin/require-role";
import { podeAcessarRota, type Role, rotaInicialDe } from "@/lib/admin/role-scope";
import { hasCampaignSignal, parseCampaignParams } from "@/lib/attribution/params";
import { ehRoboDeclarado } from "@/lib/attribution/user-agent-robo";
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
import { PARAM_PREVIEW } from "@/lib/heatmap/events";

/**
 * O prefixo de cadastro do better-auth. Prefixo, e não `/sign-up/email` exato:
 * toda a família de cadastro mora sob ele, e plugin novo (magic-link, passkey)
 * entra por baixo sem passar por revisão nenhuma.
 */
const CADASTRO_PUBLICO = "/api/auth/sign-up";

export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// Ninguém se cadastra sozinho no painel.
	//
	// `lib/auth.ts` liga `emailAndPassword` sem `disableSignUp` (default `false`
	// no better-auth) e `api/auth/[...all]` publica o handler inteiro — então
	// `POST /api/auth/sign-up/email` estava aberto para a internet. A conta
	// nascia com o default da coluna, `viewer`, que tem `TODAS_AS_ROTAS` no
	// `role-scope.ts`: funil, conversas e dados de lead a um cadastro de
	// distância.
	//
	// A trava está aqui e não em `disableSignUp` porque aquela opção é conferida
	// DENTRO do endpoint `/sign-up/email` — o mesmo que `auth.api.signUpEmail`
	// executa quando o servidor cria uma conta. Ligá-la mataria junto os cinco
	// fluxos de convite (`admin/attendants`, `mesa-attendants/[id]/acesso`,
	// `criar-acesso-admin`, `seed-admin`, `seed-mesa-externa`). O proxy separa os
	// dois casos sozinho: só a requisição vinda de FORA passa por ele; a chamada
	// server-side é in-process e não atravessa o matcher.
	//
	// Conta no Aja se ganha por convite: quem entra foi convidado por um admin e
	// recebeu o link de `/onboarding/set-password`.
	if (pathname === CADASTRO_PUBLICO || pathname.startsWith(`${CADASTRO_PUBLICO}/`)) {
		return NextResponse.json(
			{ error: "O cadastro no painel é por convite. Fale com um administrador." },
			{ status: 403 },
		);
	}

	if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
		const session = await auth.api.getSession({
			headers: await headers(),
		});

		if (!session) {
			return NextResponse.redirect(new URL("/admin/login", request.url));
		}

		// Estar logado deixou de bastar (2026-08-10). Com a `mesa_externa` — gente
		// de FORA da empresa entrando no painel — o menu inteiro da operação não
		// pode mais ficar a um clique de qualquer sessão válida. Quem decide é
		// `role-scope.ts`; aqui a decisão só é aplicada.
		//
		// Camada de navegação, não de dados: o `requireRole` de cada API continua
		// sendo o que impede um `fetch` direto de ler o que não é dele.
		// Desativado volta pro login, não pra "casa dela": não existe tela de casa
		// pra quem foi desligado. A sessão pode continuar válida por até 24h
		// (`session.expiresIn`), então sem esta checagem o acesso só terminava
		// quando o cookie expirasse — e o admin que clicou em desativar não tinha
		// como saber disso.
		if (contaDesativada(session)) {
			return NextResponse.redirect(new URL("/admin/login", request.url));
		}

		const role = ((session.user as { role?: string }).role ?? "viewer") as Role;
		if (!podeAcessarRota(role, pathname)) {
			// Volta pra tela de casa dela em vez de um 403 seco — quem tropeça aqui
			// clicou num link salvo, não tentou invadir nada.
			return NextResponse.redirect(new URL(rotaInicialDe(role), request.url));
		}
	}

	if (ehLanding(pathname)) {
		// O painel embute a landing num iframe para desenhar o mapa de calor sobre
		// ela. Aquilo é uma requisição HTTP como qualquer outra e nasceria como
		// visita: medido em 18/08/2026, abrir a tela levava `visits` de 1 para 2, e
		// o operador entrava no denominador do funil sem UTM nenhum.
		//
		// A marca vem na URL porque é o único canal que um `<iframe src>` tem — não
		// dá para mandar header. Não é trava de segurança e não precisa ser: quem
		// forjar o parâmetro só consegue NÃO ser contado.
		if (request.nextUrl.searchParams.has(PARAM_PREVIEW)) {
			return NextResponse.next();
		}
		return registrarVisita(request);
	}

	return NextResponse.next();
}

/**
 * As páginas que contam como chegada de gente ao site.
 *
 * A home não é mais a única: as landings de vertical (`/autos`, `/imoveis`,
 * `/motos`) existem para ser destino de anúncio, então é justamente nelas que o
 * UTM chega. Registrar só a home fazia toda campanha apontada para uma vertical
 * nascer sem origem.
 *
 * Lista, e não prefixo: as verticais moram na raiz do site, ao lado de qualquer
 * outra página. Vertical nova entra aqui E no `matcher` lá embaixo — fora dele o
 * proxy nem roda, e é `src/proxy.landing-atribuicao.test.ts` que prova que os
 * dois continuam de acordo, porque esquecer um deles não quebra nada na tela.
 */
export const LANDINGS = ["/", "/autos", "/imoveis", "/motos"] as const;

export function ehLanding(pathname: string): boolean {
	return (LANDINGS as readonly string[]).includes(pathname);
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
	//
	// Robô declarado entra no mesmo `if` pelo mesmo motivo, e a conta é maior do
	// que a do prefetch: medido em produção em 15/08/2026, 38.792 das 40.796
	// visitas de 30 dias eram máquina — 33.382 delas o health check do NOSSO ALB,
	// que bate em `/` a cada 30 segundos e cai neste matcher. O painel mostrava
	// 0,056% de visita → conversa; sobre gente a taxa é 1,15%.
	//
	// Aqui a sujeira para de NASCER. O histórico já gravado continua precisando
	// da mesma classificação na leitura (`performance-queries.ts`) — é a mesma
	// lista, exportada uma vez só.
	if (
		request.headers.get("next-router-prefetch") !== null ||
		request.headers.get("purpose") === "prefetch" ||
		request.headers.get("rsc") !== null ||
		ehRoboDeclarado(request.headers.get("user-agent"))
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
	// Precisa ser literal: o Next lê este array em build time, então ele não pode
	// sair de `LANDINGS`. O teste é quem mantém os dois em dia.
	matcher: [
		"/",
		"/autos",
		"/imoveis",
		"/motos",
		"/admin",
		"/admin/((?!login).*)",
		// A rota de cadastro do better-auth. Sem estas duas linhas o proxy nem é
		// chamado nela e a trava lá em cima vira decoração — o teste continuaria
		// verde com a porta aberta em produção.
		"/api/auth/sign-up",
		"/api/auth/sign-up/:path*",
	],
};
