/**
 * O CICLO que mantém o espelho local do gerenciador de anúncios.
 *
 * ── O que ele resolve ──────────────────────────────────────────────────────
 *
 * A tela do admin mostra `…370104`, e o sufixo de seis dígitos NÃO identifica:
 * medido em 17/09/2026 na conta `act_1594922312055163`, `…200104` e `…450104`
 * casam com DOIS anúncios diferentes cada. O nome de leitura
 * (`META | EXP | LEAD | BR | PLACEMENTS`) só existe no gerenciador. Este ciclo
 * lê o gerenciador e grava o espelho; a tela consulta o banco, NUNCA a Marketing
 * API (mesmo desenho do cache do resolvedor, `src/lib/meta-ads/resolver.ts`).
 *
 * ── Duas tabelas, duas chaves de conflito ──────────────────────────────────
 *
 * 1. `meta_entities` — a DIMENSÃO (nome, situação). `on conflict (entity_id)`:
 *    o id da Meta é a identidade da entidade, então reencontrá-la ATUALIZA.
 * 2. `meta_insights_diarios` — o FATO. `on conflict (data, entity_id)`: a Meta
 *    REPROCESSA os últimos dias para trás (o gasto de ontem muda depois), então
 *    reescrever o dia é o comportamento correto, e insert cego duplicaria a
 *    série. É por isso que a chave é (dia, entidade) e não um total acumulado.
 *
 * ── A chave desligada ──────────────────────────────────────────────────────
 *
 * O token (`META_ADS_TOKEN_AJA`, vault) vem do container. Ausente, o ciclo
 * **loga e sai** — não chama a rede, não explode, e devolve `desligado` com o
 * motivo. É o padrão da casa para chave desligada (ver `conversions/config.ts`):
 * ausência significa desligado, nunca "ligado por acidente".
 *
 * ── Onde roda ──────────────────────────────────────────────────────────────
 *
 * No worker (`aja-agora-worker`), como os irmãos `remarketing-cycle.ts` e
 * `reconciliacao-cycle.ts`: o deploy tem DUAS réplicas no ECS e um
 * `setInterval` no app rodaria o sync duas vezes. O job repetível do BullMQ
 * com `jobId` FIXO garante uma cópia por vez, persistida no Redis, valendo
 * entre reinícios e entre instâncias. O intervalo é longo (15 min por padrão):
 * o dado é diário, mas a Meta reprocessa o dia corrente, então vale reler.
 */

import type { ConnectionOptions } from "bullmq";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { metaEntities, metaInsightsDiarios } from "@/db/schema";
import {
	criarClienteMetaAds,
	type EntidadeDaMeta,
	ehErroDeCampoNaoPermitido,
	getMetaAdsConfig,
	type InsightDiario,
	janelaPadrao,
	type MetaAdsClient,
	motivoParaNaoSincronizar,
	type NivelDaMeta,
} from "@/lib/meta-ads/cliente";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface ResultadoDoSync {
	/** Motivo de não ter rodado. `null` = rodou. */
	desligado: string | null;
	/** Linhas de entidade gravadas neste ciclo. */
	entidades: number;
	/** Linhas de insight gravadas neste ciclo. */
	insights: number;
	/** Janela usada (para o log dizer o que foi pedido). */
	desde: string | null;
	ate: string | null;
}

export interface MetaAdsSyncDeps {
	agora?: Date;
	env?: Record<string, string | undefined>;
	/** Janela da primeira carga; default 90 dias (`META_ADS_JANELA_DIAS`). */
	janelaDias?: number;
	/** O cliente da Marketing API. Ausente = `criarClienteMetaAds()`. */
	cliente?: MetaAdsClient;
	lerEntidades?: (cliente: MetaAdsClient) => Promise<EntidadeDaMeta[]>;
	lerInsights?: (
		cliente: MetaAdsClient,
		args: { desde: string; ate: string },
	) => Promise<InsightDiario[]>;
	gravarEntidades?: (entidades: EntidadeDaMeta[], agora: Date) => Promise<number>;
	gravarInsights?: (insights: InsightDiario[]) => Promise<number>;
}

/** Janela padrão da primeira carga. Env permite encurtar para depurar. */
const JANELA_DIAS_PADRAO = 90;

const NIVEIS: NivelDaMeta[] = ["campaign", "adset", "ad"];

// ─── Gravação (default, com banco) ──────────────────────────────────────────

/**
 * Tira a duplicata DENTRO do lote.
 *
 * O Postgres recusa um `INSERT ... ON CONFLICT DO UPDATE` cujo lote afeta a
 * mesma linha duas vezes ("cannot affect row a second time"). A Meta não deveria
 * mandar a mesma entidade duas vezes em uma página, mas uma janela de 90 dias
 * com paginação torna isso possível — e a mensagem de erro não diz qual id
 * repetiu. Deduplicar aqui é a defesa barata.
 */
function unicosPor<T>(itens: T[], chave: (item: T) => string): T[] {
	const mapa = new Map<string, T>();
	for (const item of itens) mapa.set(chave(item), item);
	return [...mapa.values()];
}

/**
 * UPSERT das entidades por `entity_id`. Nome, situação e hierarquia são
 * reescritos; `visto_em` sobe para agora — é ele que diz "quando o sync viu
 * isto pela última vez" e alimenta a marcação de entidade morta.
 */
export async function gravarEntidades(entidades: EntidadeDaMeta[], agora: Date): Promise<number> {
	const linhas = unicosPor(entidades, (e) => e.entityId);
	if (linhas.length === 0) return 0;
	await db
		.insert(metaEntities)
		.values(
			linhas.map((e) => ({
				entityId: e.entityId,
				nivel: e.nivel,
				nome: e.nome,
				status: e.status,
				accountId: e.accountId,
				parentEntityId: e.parentEntityId,
				creativeId: e.creativeId ?? null,
				creativeName: e.creativeName ?? null,
				thumbnailUrl: e.thumbnailUrl ?? null,
				vistoEm: agora,
			})),
		)
		.onConflictDoUpdate({
			target: metaEntities.entityId,
			set: {
				nivel: sql`excluded.nivel`,
				nome: sql`excluded.nome`,
				status: sql`excluded.status`,
				accountId: sql`excluded.account_id`,
				parentEntityId: sql`excluded.parent_entity_id`,
				creativeId: sql`excluded.creative_id`,
				creativeName: sql`excluded.creative_name`,
				thumbnailUrl: sql`excluded.thumbnail_url`,
				vistoEm: sql`excluded.visto_em`,
				updatedAt: sql`now()`,
			},
		});
	return linhas.length;
}

/**
 * UPSERT dos insights pela chave `(data, entity_id)`.
 *
 * `on conflict do update`, nunca insert cego: a Meta reprocessa os últimos dias
 * para trás e o número de ontem muda. Reescrever o dia mantém o histórico
 * auditável (o que foi mostrado antes foi substituído pelo valor correto) e
 * evita a duplicata que quebraria a série.
 */
export async function gravarInsights(insights: InsightDiario[]): Promise<number> {
	const linhas = unicosPor(insights, (i) => `${i.data}:${i.entityId}`);
	if (linhas.length === 0) return 0;
	await db
		.insert(metaInsightsDiarios)
		.values(
			linhas.map((i) => ({
				data: i.data,
				entityId: i.entityId,
				nivel: i.nivel,
				spendCents: i.spendCents,
				impressions: i.impressions,
				clicks: i.clicks,
				leads: i.leads,
			})),
		)
		.onConflictDoUpdate({
			target: [metaInsightsDiarios.data, metaInsightsDiarios.entityId],
			set: {
				nivel: sql`excluded.nivel`,
				spendCents: sql`excluded.spend_cents`,
				impressions: sql`excluded.impressions`,
				clicks: sql`excluded.clicks`,
				leads: sql`excluded.leads`,
				coletadoEm: sql`now()`,
			},
		});
	return linhas.length;
}

// ─── Leitura (default, com rede) ────────────────────────────────────────────

/**
 * Os anúncios, degradando quando o token não tem permissão no campo `creative`.
 *
 * A Graph API responde #100/#200 se `creative` não for permitido — e aí a
 * requisição INTEIRA falha, não só o campo. Sem esta degradação o espelho
 * perderia TODOS os anúncios por causa de um campo acessório. O log é UMA vez
 * por ciclo, não por anúncio: um aviso por ciclo já diz o que precisa.
 */
async function lerAnunciosTolerante(cliente: MetaAdsClient): Promise<EntidadeDaMeta[]> {
	try {
		return await cliente.lerAnuncios();
	} catch (err) {
		if (!ehErroDeCampoNaoPermitido(err)) throw err;
		console.warn(
			JSON.stringify({
				level: "warn",
				source: "meta-ads-sync",
				etapa: "criativo",
				aviso: "campo creative não permitido pelo token — seguindo sem criativo",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
		return cliente.lerAnuncios({ semCriativo: true });
	}
}

async function lerEntidadesPadrao(cliente: MetaAdsClient): Promise<EntidadeDaMeta[]> {
	const [campanhas, conjuntos, anuncios] = await Promise.all([
		cliente.lerCampanhas(),
		cliente.lerConjuntos(),
		lerAnunciosTolerante(cliente),
	]);
	return [...campanhas, ...conjuntos, ...anuncios];
}

async function lerInsightsPadrao(
	cliente: MetaAdsClient,
	args: { desde: string; ate: string },
): Promise<InsightDiario[]> {
	const porNivel = await Promise.all(
		NIVEIS.map((nivel) => cliente.lerInsightsDiarios({ ...args, nivel })),
	);
	return porNivel.flat();
}

// ─── O ciclo ────────────────────────────────────────────────────────────────

/**
 * Um ciclo do sync. Todas as dependências de I/O entram por parâmetro — é o que
 * permite provar, sem rede, que a chave desligada não faz nada e que a mesma
 * chave `(data, entity_id)` chegando duas vezes vira UPDATE.
 */
export async function runMetaAdsSyncCycle(deps: MetaAdsSyncDeps = {}): Promise<ResultadoDoSync> {
	const env = deps.env ?? process.env;
	const agora = deps.agora ?? new Date();
	const cfg = getMetaAdsConfig(env);

	// ── Chave desligada: loga e sai ──────────────────────────────────────────
	const motivo = motivoParaNaoSincronizar(cfg, env);
	if (motivo) {
		console.log(
			JSON.stringify({
				level: "info",
				source: "meta-ads-sync",
				etapa: "guarda",
				desligado: motivo,
			}),
		);
		return { desligado: motivo, entidades: 0, insights: 0, desde: null, ate: null };
	}

	const dias = deps.janelaDias ?? Number(env.META_ADS_JANELA_DIAS ?? JANELA_DIAS_PADRAO);
	const { desde, ate } = janelaPadrao(Number.isFinite(dias) ? dias : JANELA_DIAS_PADRAO, agora);
	const cliente = deps.cliente ?? criarClienteMetaAds(cfg);
	const lerEntidades = deps.lerEntidades ?? lerEntidadesPadrao;
	const lerInsights = deps.lerInsights ?? lerInsightsPadrao;
	const gravarEnt = deps.gravarEntidades ?? gravarEntidades;
	const gravarIns = deps.gravarInsights ?? gravarInsights;

	let entidades = 0;
	try {
		const lidas = await lerEntidades(cliente);
		entidades = await gravarEnt(lidas, agora);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "meta-ads-sync",
				etapa: "entidades",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
	}

	let insights = 0;
	try {
		const lidos = await lerInsights(cliente, { desde, ate });
		insights = await gravarIns(lidos);
	} catch (err) {
		console.error(
			JSON.stringify({
				level: "error",
				source: "meta-ads-sync",
				etapa: "insights",
				error: err instanceof Error ? err.message : String(err),
			}),
		);
	}

	console.log(
		JSON.stringify({
			level: "info",
			source: "meta-ads-sync",
			etapa: "fim",
			entidades,
			insights,
			desde,
			ate,
		}),
	);

	return { desligado: null, entidades, insights, desde, ate };
}

// ─── Wiring BullMQ (só no entrypoint do worker; nunca em teste) ──────────────

const QUEUE_NAME = "meta-ads-sync-cycle";

/**
 * Intervalo do sync. 15 min de propósito: o fato é DIÁRIO, mas a Meta reprocessa
 * o dia corrente — reler com folga mantém o espelho de hoje correto sem
 * martelar a Marketing API (que tem limite de chamadas por hora).
 */
const POLL_INTERVAL_MS = Number(process.env.META_ADS_SYNC_POLL_INTERVAL_MS ?? 15 * 60 * 1000);

/**
 * Sobe a fila + worker BullMQ com job repetível. Exige Redis (`REDIS_URL`) —
 * degrada com log se ausente, no mesmo padrão de `remarketing-cycle.ts`.
 *
 * O `jobId` FIXO é o que garante UMA cópia por vez: o `repeat.every` sozinho
 * criaria um job a cada intervalo, e o BullMQ mantém um job repetível por
 * `jobId`. É por isso que não existe `setInterval` aqui.
 */
export async function startMetaAdsSyncWorker() {
	const REDIS_URL = process.env.REDIS_URL;
	if (!REDIS_URL) {
		console.warn(
			"[meta-ads-sync] REDIS_URL ausente — sync do gerenciador NÃO iniciado (o resto do worker segue)",
		);
		return null;
	}

	const { Queue, Worker } = await import("bullmq");
	const { default: IORedis } = await import("ioredis");
	const connection = new IORedis(REDIS_URL, {
		maxRetriesPerRequest: null,
	}) as unknown as ConnectionOptions;

	const queue = new Queue(QUEUE_NAME, { connection });
	await queue.add(
		"sync",
		{},
		{
			repeat: { every: POLL_INTERVAL_MS },
			jobId: "meta-ads-sync-cron",
			removeOnComplete: true,
		},
	);

	const worker = new Worker(
		QUEUE_NAME,
		async () => {
			const resultado = await runMetaAdsSyncCycle();
			if (resultado.entidades > 0 || resultado.insights > 0) {
				console.log(`[meta-ads-sync] ciclo: ${JSON.stringify(resultado)}`);
			}
		},
		{ connection },
	);

	const motivo = motivoParaNaoSincronizar(getMetaAdsConfig());
	console.log(
		`[meta-ads-sync] worker ativo (intervalo ${POLL_INTERVAL_MS}ms)${motivo ? ` — DESLIGADO (${motivo})` : ""}`,
	);
	return { queue, worker };
}
