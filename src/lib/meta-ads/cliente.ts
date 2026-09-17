// Cliente da Marketing API da Meta — o único lugar que fala com o gerenciador.
//
// ## Por que existe
//
// A tela do admin mostra `…370104` e o sufixo de seis dígitos não identifica:
// medido em 17/09/2026 na conta `act_1594922312055163`, `…200104` e `…450104`
// casam com DOIS anúncios diferentes cada. O nome real (`META | EXP | LEAD | BR
// | PLACEMENTS`) só existe no gerenciador, e quem o traz para dentro é o ciclo de
// sync (`src/lib/workers/meta-ads-sync-cycle.ts`) usando este cliente.
//
// ## A chave desligada
//
// O token mora no vault (cofre `tb-ai-general`) e chega ao container como
// `META_ADS_TOKEN_AJA`. Sem a variável, `motivoParaNaoSincronizar()` devolve o
// motivo e o ciclo **loga e sai** — nunca explode, nunca chama a rede. É o mesmo
// desenho de `CONVERSIONS_API_ENABLED` (ver `src/lib/conversions/config.ts`):
// ausente = desligado, e desligado é um resultado legítimo, não um erro.
//
// ## O que este módulo NÃO faz
//
// Não guarda cache e não decide verba: devolve o que a Meta respondeu, normalizado
// para o formato das tabelas (`meta_entities` / `meta_insights_diarios`). Quem
// grava é o ciclo; quem lê na tela é o resolvedor (`resolver.ts`).

import { TZ_NEGOCIO } from "@/lib/admin/periodo";

/** A conta do Aja Agora no gerenciador. Override por env só para homologação. */
export const CONTA_PADRAO = "act_1594922312055163";

/** Versão fixada de propósito: a Graph API quebra contrato entre versões. */
const VERSAO_PADRAO = "v21.0";

/** O nível da entidade, como o schema (`meta_entity_nivel`) o grafa. */
export type NivelDaMeta = "campaign" | "adset" | "ad";

/** Uma campanha, conjunto ou anúncio — a dimensão que `meta_entities` espelha. */
export interface EntidadeDaMeta {
	/** O id completo da Meta. Nunca truncado. */
	entityId: string;
	nivel: NivelDaMeta;
	/** `META | EXP | LEAD | BR | PLACEMENTS` — o nome que o time reconhece. */
	nome: string;
	status: string | null;
	accountId: string | null;
	/** A entidade acima na hierarquia (conjunto → campanha, anúncio → conjunto). */
	parentEntityId: string | null;
}

/** O fato de UM dia para UMA entidade — o que `meta_insights_diarios` espelha. */
export interface InsightDiario {
	/** "YYYY-MM-DD" no fuso do negócio. */
	data: string;
	entityId: string;
	nivel: NivelDaMeta;
	/** Em centavos, como todo dinheiro no schema. */
	spendCents: number | null;
	impressions: number | null;
	clicks: number | null;
	/** O que a Meta atribuiu como lead — ao lado do que o CRM conta, não no lugar. */
	leads: number | null;
}

export interface ConfigMetaAds {
	token: string | null;
	accountId: string;
	apiVersion: string;
}

export function getMetaAdsConfig(
	env: Record<string, string | undefined> = process.env,
): ConfigMetaAds {
	return {
		token: env.META_ADS_TOKEN_AJA?.trim() || null,
		accountId: env.META_ADS_ACCOUNT_ID?.trim() || CONTA_PADRAO,
		apiVersion: env.META_GRAPH_API_VERSION?.trim() || VERSAO_PADRAO,
	};
}

/**
 * Por que o sync não pode (ou não deve) rodar. `null` = pode.
 *
 * Devolve o motivo, e não só um booleano: o log precisa dizer "faltou o token"
 * em vez de deixar alguém procurando por que o espelho não atualiza.
 *
 * `META_ADS_SYNC_ATIVO` é uma trava de operador: presente e diferente de
 * ligado/login/1/true/sim desliga o ciclo mesmo com o token no ambiente — útil
 * para parar o sync durante uma migração sem remover o token do container. A
 * chave PRIMÁRIA continua sendo o token: ausente = desligado, sempre.
 */
export function motivoParaNaoSincronizar(
	cfg: ConfigMetaAds = getMetaAdsConfig(),
	env: Record<string, string | undefined> = process.env,
): string | null {
	const trava = (env.META_ADS_SYNC_ATIVO ?? "").trim().toLowerCase();
	if (trava && trava !== "1" && trava !== "true" && trava !== "sim") {
		return "META_ADS_SYNC_ATIVO desligado";
	}
	if (!cfg.token) return "META_ADS_TOKEN_AJA ausente";
	return null;
}

/** Uma página da Graph API. `paging.next` é o cursor da paginação. */
export interface PaginaDaMeta<T> {
	data: T[];
	next: string | null;
}

export type FetchDaMeta = (url: string) => Promise<{
	ok: boolean;
	status: number;
	json: () => Promise<unknown>;
}>;

function formatarDia(data: Date): string {
	return data.toLocaleDateString("en-CA", { timeZone: TZ_NEGOCIO });
}

/** O `since` da janela padrão: hoje menos `dias`, no fuso do negócio. */
export function janelaPadrao(
	dias: number,
	agora: Date = new Date(),
): { desde: string; ate: string } {
	const ate = formatarDia(agora);
	const desde = formatarDia(new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000));
	return { desde, ate };
}

/** Centavos a partir do que a Meta manda: string decimal ("123.45") ou número. */
export function centavosDeSpend(spend: unknown): number | null {
	if (spend === null || spend === undefined || spend === "") return null;
	const valor = typeof spend === "number" ? spend : Number.parseFloat(String(spend));
	if (!Number.isFinite(valor)) return null;
	return Math.round(valor * 100);
}

/**
 * Quantos leads a Meta atribuiu neste dia.
 *
 * A resposta traz um array `actions` com vários `action_type` que contam lead
 * (`lead`, `offsite_conversion.fb_pixel_lead`, `onsite_conversion.lead_grouped`).
 * Eles **se sobrepõem** — somar todos infla o número. Por isso a escolha é por
 * PRIORIDADE, na ordem abaixo, e não por soma; o primeiro que existir responde.
 * Devolve `null` quando não há nada, para não escrever zero onde não houve dado.
 */
const ORDEM_DOS_LEADS = [
	"lead",
	"onsite_conversion.lead_grouped",
	"offsite_conversion.fb_pixel_lead",
	"offsite_conversion.fb_pixel_custom",
];

export function leadsDeActions(actions: unknown): number | null {
	if (!Array.isArray(actions)) return null;
	for (const tipo of ORDEM_DOS_LEADS) {
		const achado = actions.find(
			(a) => (a as { action_type?: string } | null)?.action_type === tipo,
		);
		if (!achado) continue;
		const valor = Number((achado as { value?: unknown }).value);
		if (Number.isFinite(valor)) return valor;
	}
	return null;
}

// ─── O cliente ──────────────────────────────────────────────────────────────

export interface MetaAdsClient {
	lerCampanhas(): Promise<EntidadeDaMeta[]>;
	lerConjuntos(): Promise<EntidadeDaMeta[]>;
	lerAnuncios(): Promise<EntidadeDaMeta[]>;
	/** Insights diários de um nível, dentro da janela. */
	lerInsightsDiarios(args: {
		desde: string;
		ate: string;
		nivel: NivelDaMeta;
	}): Promise<InsightDiario[]>;
}

/**
 * Constrói o cliente. `fetchImpl` existe para o teste provar paginação e
 * normalização SEM rede — em produção é o `fetch` global do Node 22.
 *
 * Sem token, o construtor **não lança**: quem decide se pode rodar é o ciclo,
 * via `motivoParaNaoSincronizar()`. Chamar um método aqui sem token vira erro
 * explícito, que é o correto para um caminho que já foi liberado a rodar.
 */
export function criarClienteMetaAds(
	cfg: ConfigMetaAds = getMetaAdsConfig(),
	fetchImpl: FetchDaMeta = globalThis.fetch as unknown as FetchDaMeta,
): MetaAdsClient {
	const base = `https://graph.facebook.com/${cfg.apiVersion}`;

	async function pedir(url: string): Promise<unknown> {
		const resposta = await fetchImpl(url);
		const corpo = await resposta.json();
		if (!resposta.ok) {
			const erro = (corpo as { error?: { message?: string } } | null)?.error?.message;
			throw new Error(`Marketing API ${resposta.status}: ${erro ?? "sem detalhe"}`);
		}
		return corpo;
	}

	/** Segue `paging.next` até a última página, com teto de segurança. */
	async function paginar<T>(url: string): Promise<T[]> {
		const itens: T[] = [];
		let atual: string | null = url;
		let paginas = 0;
		while (atual) {
			if (++paginas > 50) {
				throw new Error("Marketing API: paginação passou de 50 páginas — abortando");
			}
			const corpo = (await pedir(atual)) as { data?: T[]; paging?: { next?: string } };
			itens.push(...(corpo.data ?? []));
			atual = corpo.paging?.next ?? null;
		}
		return itens;
	}

	/** A query string comum: campos + limite + token. */
	function urlDe(caminho: string, params: Record<string, string>): string {
		const busca = new URLSearchParams({ ...params, access_token: cfg.token ?? "" });
		return `${base}/${caminho}?${busca.toString()}`;
	}

	function entidadeDe(linha: Record<string, unknown>, nivel: NivelDaMeta): EntidadeDaMeta {
		const pai =
			nivel === "adset"
				? (linha.campaign_id as string | undefined)
				: nivel === "ad"
					? (linha.adset_id as string | undefined)
					: undefined;
		return {
			entityId: String(linha.id),
			nivel,
			nome: String(linha.name ?? "").trim() || String(linha.id),
			status: ((linha.status ?? linha.effective_status) as string | undefined) ?? null,
			accountId: (linha.account_id as string | undefined) ?? null,
			parentEntityId: pai ?? null,
		};
	}

	return {
		async lerCampanhas() {
			const linhas = await paginar<Record<string, unknown>>(
				urlDe(`${cfg.accountId}/campaigns`, {
					fields: "id,name,status,effective_status,account_id",
					limit: "100",
				}),
			);
			return linhas.map((l) => entidadeDe(l, "campaign"));
		},

		async lerConjuntos() {
			const linhas = await paginar<Record<string, unknown>>(
				urlDe(`${cfg.accountId}/adsets`, {
					fields: "id,name,status,effective_status,account_id,campaign_id",
					limit: "100",
				}),
			);
			return linhas.map((l) => entidadeDe(l, "adset"));
		},

		async lerAnuncios() {
			const linhas = await paginar<Record<string, unknown>>(
				urlDe(`${cfg.accountId}/ads`, {
					fields: "id,name,status,effective_status,account_id,adset_id,campaign_id",
					limit: "100",
				}),
			);
			return linhas.map((l) => entidadeDe(l, "ad"));
		},

		async lerInsightsDiarios({ desde, ate, nivel }) {
			// O id da entidade chega em campo cujo nome segue o nível
			// (`campaign_id`, `adset_id`, `ad_id`). Sem pedir o campo certo, o
			// insight vira linha órfã — por isso ele está na lista de `fields`.
			const campos = ["spend", "impressions", "clicks", "actions", `${nivel}_id`].join(",");
			const nivelNaMeta = nivel === "campaign" ? "campaign" : nivel === "adset" ? "adset" : "ad";
			const linhas = await paginar<Record<string, unknown>>(
				urlDe(`${cfg.accountId}/insights`, {
					level: nivelNaMeta,
					time_increment: "1",
					time_range: JSON.stringify({ since: desde, until: ate }),
					fields: campos,
					limit: "500",
				}),
			);
			return linhas
				.map((l) => {
					const entityId = l[`${nivel}_id`];
					const data = l.date_start;
					if (!entityId || !data) return null;
					return {
						data: String(data),
						entityId: String(entityId),
						nivel,
						spendCents: centavosDeSpend(l.spend),
						impressions: numeroOuNulo(l.impressions),
						clicks: numeroOuNulo(l.clicks),
						leads: leadsDeActions(l.actions),
					} satisfies InsightDiario;
				})
				.filter((i): i is InsightDiario => i !== null);
		},
	};
}

function numeroOuNulo(valor: unknown): number | null {
	if (valor === null || valor === undefined || valor === "") return null;
	const n = typeof valor === "number" ? valor : Number(valor);
	return Number.isFinite(n) ? n : null;
}
