import { type LeadStage, STAGE_ORDER } from "./lead-stages";

/**
 * Papéis com acesso ao painel.
 *
 * `mesa_externa` (2026-08-10) é o atendente de mesa COM login. Até aqui ele só
 * existia como nome + WhatsApp em `mesa_attendants` e trabalhava pelo copiloto;
 * agora entra no painel — mas enxergando apenas o pedaço do funil que é dele.
 */
export type Role = "admin" | "viewer" | "attendant" | "mesa_externa";

/** Raia terminal de perda — destino, nunca origem. */
const PERDIDO = "perdido" satisfies LeadStage;

/** As etapas de PROGRESSO da mesa externa, na ordem em que o caso caminha. */
const PROGRESSO_DA_MESA_EXTERNA = [
	"em_atendimento",
	"aguardando_pagamento",
	"fechado_ganho",
] as const satisfies readonly LeadStage[];

/**
 * Raias que a mesa externa opera, na ordem do funil.
 *
 * `perdido` entrou em 2026-08-10 (decisão do Kairo, revendo a escolha inicial):
 * sem uma saída por perda, o caso frustrado ficava preso em atendimento pra
 * sempre — a coluna existia no funil, mas não pra quem estava atendendo.
 */
const RAIAS_DA_MESA_EXTERNA = [
	...PROGRESSO_DA_MESA_EXTERNA,
	PERDIDO,
] as const satisfies readonly LeadStage[];

/**
 * ALLOWLIST — a chave é a role, e o que não está aqui não vê nada.
 *
 * Escrito como mapa (e não como `if role === 'mesa_externa'`) de propósito: role
 * nova nasce SEM acesso e precisa ser declarada, em vez de herdar o funil
 * inteiro por omissão.
 */
const RAIAS_POR_ROLE: Record<Role, readonly LeadStage[]> = {
	admin: STAGE_ORDER,
	viewer: STAGE_ORDER,
	attendant: STAGE_ORDER,
	mesa_externa: RAIAS_DA_MESA_EXTERNA,
};

/** Roles que podem arrastar card. `viewer` é leitura. */
const PODE_ARRASTAR: Record<Role, boolean> = {
	admin: true,
	viewer: false,
	attendant: true,
	mesa_externa: true,
};

export function raiasVisiveisPara(role: Role): readonly LeadStage[] {
	return RAIAS_POR_ROLE[role] ?? [];
}

/** Marca de "esta role entra em qualquer tela do painel". */
const TODAS_AS_ROTAS = "*" as const;

/**
 * ALLOWLIST de telas. Mesma disciplina das raias: papel novo não herda o painel
 * inteiro, e tela nova não fica acessível à mesa externa por descuido — ela só
 * entra em `/admin/pipeline` e no próprio perfil, ponto.
 */
const ROTAS_POR_ROLE: Record<Role, readonly string[] | typeof TODAS_AS_ROTAS> = {
	admin: TODAS_AS_ROTAS,
	viewer: TODAS_AS_ROTAS,
	attendant: TODAS_AS_ROTAS,
	mesa_externa: ["/admin/pipeline", "/admin/profile"],
};

/** Tela pra onde cada role é levada ao entrar (ou ao bater numa porta fechada). */
const ROTA_INICIAL: Record<Role, string> = {
	admin: "/admin",
	viewer: "/admin",
	attendant: "/admin",
	mesa_externa: "/admin/pipeline",
};

export function rotaInicialDe(role: Role): string {
	return ROTA_INICIAL[role] ?? "/admin";
}

export function podeAcessarRota(role: Role, pathname: string): boolean {
	const permitidas = ROTAS_POR_ROLE[role];
	if (!permitidas) return false;
	if (permitidas === TODAS_AS_ROTAS) return true;

	// Casa a rota exata ou um filho dela. O `/` é obrigatório pra que
	// `/admin/pipeline-secreto` não passe por ser sub-rota de `/admin/pipeline`.
	return permitidas.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isMesaExterna(role: string | null | undefined): boolean {
	return role === "mesa_externa";
}

/**
 * A role pode mover um card de `origem` para `destino`?
 *
 * Para a mesa externa, mover é sempre DENTRO do escopo dela e sempre PRA FRENTE:
 * o caso que ela assumiu caminha até o fechamento. Declarar perda fica com quem
 * enxerga o funil inteiro — a mesa externa não tem contexto (nem mandato) pra
 * matar um lead.
 *
 * Para admin/attendant esta política não restringe nada: o forward-only geral do
 * funil é do servidor (`transitionLeadStage`), e continua valendo lá.
 */
/**
 * A role pode mover um card de `origem` para `destino`?
 *
 * O que restringe é ESCOPO, não direção: cada papel mexe nas raias que enxerga,
 * e em qualquer sentido.
 *
 * O forward-only caiu em 2026-08-10 (decisão do Kairo: "esse negócio de não
 * poder voltar atrás não existe, ele deve poder movimentar sempre"). A regra
 * partia da ideia de que arrasto pra trás é acidente; na operação real, corrigir
 * uma classificação errada é rotina — e a trava transformava um clique numa
 * mensagem de erro que o operador não tinha como resolver.
 */
export function podeMoverCard(role: Role, origem: LeadStage, destino: LeadStage): boolean {
	if (!PODE_ARRASTAR[role]) return false;

	const escopo = raiasVisiveisPara(role);
	if (escopo.length === 0) return false;

	// Quem enxerga o funil inteiro move o que quiser, pra onde quiser.
	if (escopo === STAGE_ORDER) return true;

	// Escopo restrito: as duas pontas têm que estar entre as raias que ela vê —
	// mas a ordem entre elas não importa.
	return escopo.includes(origem) && escopo.includes(destino);
}
