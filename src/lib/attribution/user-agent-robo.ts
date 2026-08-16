// Quem é máquina, declarado pelo próprio cliente.
//
// Não é adivinhação sobre comportamento: é a leitura de um HEADER que o cliente
// mandou dizendo o que ele é. Robô que se identifica é fato; robô que se
// disfarça de navegador este módulo não pega — e nem tenta, porque heurística
// sobre texto livre erraria contra gente.
//
// MEDIDO em produção (2026-08-15, 30 dias): de 40.796 visitas gravadas, 38.792
// eram robô declarado. Só o `ELB-HealthChecker` do nosso ALB, que bate em `/` a
// cada 30 segundos e cai no matcher do proxy, respondia por 33.382 — com 1,00
// visita por visitante e ZERO conversas. O painel mostrava 0,056% de visita →
// conversa quando a taxa sobre gente é 1,15%.
//
// Uma fonte só para as duas pontas: o proxy filtra em TypeScript (a sujeira
// para de nascer) e o painel filtra em SQL (os 30 dias já gravados ficam
// legíveis). Se as duas listas divergissem, a tela contaria como gente o que o
// proxy jogou fora — por isso o padrão SQL sai da MESMA lista, e há teste
// provando que os dois casam.

/**
 * Tokens que só aparecem em user-agent de cliente programático.
 *
 * `bot` está aqui com fronteira de palavra — sem ela, "Abbott" viraria robô.
 */
const TOKENS_DE_ROBO = [
	"ELB-HealthChecker",
	"facebookexternalhit",
	"python-requests",
	"HeadlessChrome",
	"crawler",
	"spider",
	"curl",
	"wget",
	"bot",
] as const;

/**
 * O mesmo padrão, em regex POSIX, para o `~*` do Postgres.
 *
 * `\y` (fronteira de palavra do Postgres) não existe no motor do JS, então a
 * fronteira é escrita como classe de caractere explícita, que os dois entendem
 * igual — o teste compara um contra o outro.
 *
 * A fronteira é só à DIREITA, e isso é deliberado: `Googlebot`, `bingbot` e
 * `YandexBot` colam o token no nome, e exigir fronteira à esquerda deixaria os
 * três passarem como gente. À direita ela é obrigatória, senão `Abbott` — que
 * contém "bot" seguido de outra letra — viraria robô.
 */
export const PADRAO_ROBO_SQL = `(${TOKENS_DE_ROBO.join("|")})([^a-z]|$)`;

const RE_ROBO = new RegExp(PADRAO_ROBO_SQL, "i");

/**
 * `true` quando o cliente se declarou máquina — ou não se declarou nada.
 *
 * User-agent ausente conta como robô: navegador real sempre manda o header, e
 * em produção os registros sem UA tinham 1,00 visita por visitante e nenhuma
 * conversa.
 */
export function ehRoboDeclarado(userAgent: string | null | undefined): boolean {
	const ua = userAgent?.trim();
	if (!ua) return true;
	return RE_ROBO.test(ua);
}
