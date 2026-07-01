/**
 * FIX-180 (Mirella, 2026-07-01) — allowlist estado→ação→PRECONDIÇÃO.
 *
 * A dimensão de DADO da governança da metade de trás da jornada. Generaliza o
 * FIX-179 (que era um `if (!shown.ids.has(...))` ad-hoc DENTRO do execute de cada
 * tool) para uma TABELA DECLARATIVA: cada ação de risco declara positivamente a
 * precondição sobre o dado ancorado em cena. É a aplicação das Leis 2 (allowlist,
 * não blocklist) e 3 (nunca agir sobre entidade não-ancorada) de
 * ~/.claude/reference/arquitetura-agentes-ia.md.
 *
 * Divisão de responsabilidade (as duas dimensões da allowlist):
 *   - ESTADO → AÇÃO: `tool-policy.ts` (`allowedTools`/`phaseFromMeta`) — qual tool
 *     é válida em qual fase. Enforçada no request (filtro do builder) + belt nativo
 *     `prepareStep.activeTools`.
 *   - AÇÃO → PRECONDIÇÃO (este módulo): a tool, mesmo válida na fase, só age sobre
 *     grupo/administradora que o usuário JÁ VIU em tela (shown-groups, FIX-179).
 *
 * Camada "existe na Bevi?" (id fabricado — FIX-72 `looksLikeFabricatedGroupId` /
 * `GroupNotInDiscoveryError`) é OUTRA e vive no adapter (ai-sdk.ts): roda DEPOIS
 * desta ("foi exibido?" precede "existe na Bevi?").
 *
 * ADR: docs/correcoes/decisions/2026-07-01-bloco-a-governanca-agente.md.
 */
import type { ShownGroups } from "@/lib/agent/tools/shown-groups";

export type ActionPreconditionContext = {
	/** O que já foi REALMENTE exibido em tela nesta conversa (ids + administradoras). */
	shown: ShownGroups;
	/** Input validado da tool (schema Zod já passou). */
	args: Record<string, unknown>;
};

export type PreconditionVerdict =
	| { allow: true }
	| { allow: false; directive: string };

/**
 * FIX-179 — grupo real na Bevi mas nunca exibido em tela. Diretiva ACIONÁVEL
 * (devolve o controle pro modelo re-ancorar) — o execute embrulha em { error }.
 */
export function naoExibidoDirective(groupId: string): string {
	return (
		`O grupo "${groupId}" nao foi exibido em tela pro usuario nesta conversa. ` +
		"Apresente-o primeiro via present_comparison_table, present_group_card ou present_recommendation_card " +
		"antes de simular, detalhar ou propor decisao sobre ele. NUNCA pule direto pra simulacao/decisao " +
		"sobre um grupo que so voce viu no resultado da busca — reapresente o comparativo."
	);
}

/** FIX-179 — administradora nunca apresentada no card de decisão (o 'Embracon' do nada). */
export function administradoraNaoExibidaDirective(administradora: string): string {
	return (
		`[Bloqueado: o plano "${administradora}" ainda nao foi apresentado pro usuario nesta conversa. ` +
		"Apresente a recomendacao/comparativo (present_comparison_table / present_recommendation_card) " +
		"ANTES do card de decisao — nunca proponha decisao sobre um plano que o usuario nao viu.]"
	);
}

/** Precondição: o `groupId` do input já foi exibido em tela. */
function requireShownGroupId(ctx: ActionPreconditionContext): PreconditionVerdict {
	const groupId = typeof ctx.args.groupId === "string" ? ctx.args.groupId : "";
	if (!ctx.shown.ids.has(groupId)) {
		return { allow: false, directive: naoExibidoDirective(groupId) };
	}
	return { allow: true };
}

/**
 * Precondição: se o card de decisão nomeia uma administradora, ela já foi
 * exibida. Sem administradora (decisão genérica), nada a validar (allow) — mesmo
 * comportamento do FIX-179.
 */
function requireShownAdministradora(ctx: ActionPreconditionContext): PreconditionVerdict {
	const administradora = ctx.args.administradora;
	if (typeof administradora === "string" && administradora.length > 0) {
		if (!ctx.shown.administradoras.has(administradora)) {
			return { allow: false, directive: administradoraNaoExibidaDirective(administradora) };
		}
	}
	return { allow: true };
}

/**
 * Tabela declarativa `ação → precondição de dado`. Cobre exatamente as 3 tools de
 * risco (as mesmas do FIX-179). Tool NOVA de decisão/apresentação sobre grupo:
 * adicionar aqui — fail-open por desenho pra tools SEM ancoragem de dado (busca,
 * status), fail-closed pras que operam sobre grupo específico (entram na tabela).
 */
export const ACTION_PRECONDITIONS: Record<
	string,
	(ctx: ActionPreconditionContext) => PreconditionVerdict
> = {
	simulate_quota: requireShownGroupId,
	get_group_details: requireShownGroupId,
	present_decision_prompt: requireShownAdministradora,
};

/**
 * Avalia a precondição de dado de uma ação. Tool fora da tabela não tem
 * precondição de dado (allow) — a dimensão ESTADO→AÇÃO dela vive no tool-policy.
 */
export function evaluateActionPrecondition(
	toolName: string,
	ctx: ActionPreconditionContext,
): PreconditionVerdict {
	const rule = ACTION_PRECONDITIONS[toolName];
	return rule ? rule(ctx) : { allow: true };
}
