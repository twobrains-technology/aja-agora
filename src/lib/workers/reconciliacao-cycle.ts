// O ciclo que publica a reconciliação fala × estado.
//
// Roda junto do watchdog que já existe. Não instrumenta o caminho do turno de
// propósito: o estado que interessa ("o formulário nunca apareceu", "não há
// proposta") só é conclusivo DEPOIS de alguns turnos, e medir isso dentro do
// turno exigiria um campo novo escrito nos sete lugares que marcam
// `decisionDispatched` — mais uma regra em sete cópias, no próprio remédio para
// o problema das cópias.
//
// Aqui tudo é derivado do que já está gravado: artifacts têm tipo e hora,
// mensagens têm hora, `bevi_proposals` tem linha ou não tem.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { getLangfuseClient } from "@/lib/observability/langfuse/client";
import { ambienteLangfuse } from "@/lib/observability/langfuse/env";
import { scoresDeReconciliacao } from "@/lib/observability/reconciliacao-fala-estado";

/** Conversas por ciclo. */
const POR_CICLO = 50;

/** Só o que teve movimento recente — o resto já foi medido e não muda mais. */
const JANELA_HORAS = 48;

export type LinhaDeReconciliacao = {
	id: string;
	metadata: unknown;
	maxStageReached: string | null;
	decisaoOferecidaEm: Date | null;
	contratoOferecido: boolean;
	mensagensDoUsuarioAposDecisao: number;
	propostas: number;
};

/**
 * As conversas do próximo ciclo, com quem NUNCA foi medido na frente.
 *
 * A ordenação não é preferência: sem ela, o `LIMIT` recortava um subconjunto
 * arbitrário — o Postgres não promete ordem sem `ORDER BY` e, na prática,
 * devolve as mesmas linhas a cada varredura. Passando do teto por ciclo de
 * conversas movimentadas na janela, o excedente nunca era avaliado.
 *
 * Foi o que aconteceu com `fd76e393` (16/08/2026): a conversa casava com
 * `venda_prometida_sem_proposta` — anunciou fecho com zero propostas — e
 * terminou com `reconciliacao` nula. O sinal certo existia e simplesmente não
 * olhou para ela, sem que nada indicasse isso.
 *
 * ⚠️ Nada aqui interpola valor JS dentro de comentário SQL: no template do
 * drizzle, `${...}` vira PARÂMETRO mesmo dentro de `--`, e a query estoura com
 * "could not determine data type of parameter $1".
 */
export async function findConversasParaReconciliar(): Promise<LinhaDeReconciliacao[]> {
	const rows = await db.execute(sql`
		WITH recentes AS (
			SELECT c.id, c.metadata
			FROM conversations c
			WHERE c.is_simulated = false
			  AND c.updated_at > now() - interval '${sql.raw(String(JANELA_HORAS))} hours'
			ORDER BY (c.metadata->>'reconciliacao' IS NOT NULL), c.updated_at DESC
			LIMIT ${POR_CICLO}
		),
		decisao AS (
			SELECT m.conversation_id, min(a.created_at) AS em
			FROM artifacts a
			JOIN messages m ON m.id = a.message_id
			WHERE a.type IN ('decision_prompt', 'two_paths')
			GROUP BY m.conversation_id
		),
		contrato AS (
			SELECT DISTINCT m.conversation_id
			FROM artifacts a
			JOIN messages m ON m.id = a.message_id
			WHERE a.type = 'contract_form'
		)
		SELECT r.id, r.metadata,
		       r.metadata->>'maxStageReached' AS "maxStageReached",
		       d.em AS "decisaoOferecidaEm",
		       (ct.conversation_id IS NOT NULL) AS "contratoOferecido",
		       coalesce((
		         SELECT count(*) FROM messages um
		         WHERE um.conversation_id = r.id AND um.role = 'user'
		           AND d.em IS NOT NULL AND um.created_at > d.em
		       ), 0)::int AS "mensagensDoUsuarioAposDecisao",
		       coalesce((
		         SELECT count(*) FROM bevi_proposals p WHERE p.conversation_id = r.id
		       ), 0)::int AS "propostas"
		FROM recentes r
		LEFT JOIN decisao d ON d.conversation_id = r.id
		LEFT JOIN contrato ct ON ct.conversation_id = r.id
	`);
	return (
		Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
	) as LinhaDeReconciliacao[];
}

export type ReconciliacaoDeps = {
	listar?: () => Promise<LinhaDeReconciliacao[]>;
	publicar?: (conversationId: string, sinais: ReturnType<typeof scoresDeReconciliacao>) => void;
};

export async function runReconciliacaoCycle(
	deps: ReconciliacaoDeps = {},
): Promise<{ publicadas: number; sinais: Record<string, number> }> {
	const listar = deps.listar ?? findConversasParaReconciliar;
	const publicar = deps.publicar ?? publicarNoLangfuse;

	const linhas = await listar();
	let publicadas = 0;
	const sinais: Record<string, number> = {};

	for (const linha of linhas) {
		try {
			const scores = scoresDeReconciliacao({
				maxStageReached: linha.maxStageReached,
				decisaoOferecidaEm: linha.decisaoOferecidaEm ? new Date(linha.decisaoOferecidaEm) : null,
				contratoOferecido: Boolean(linha.contratoOferecido),
				mensagensDoUsuarioAposDecisao: Number(linha.mensagensDoUsuarioAposDecisao ?? 0),
				propostas: Number(linha.propostas ?? 0),
			});

			const meta = metaOf(linha);
			const assinatura = scores.map((s) => s.name).join(",");
			// IDEMPOTÊNCIA: o ciclo roda a cada 30s. Sem isto, a mesma conversa
			// travada publicaria o mesmo alarme 2.880 vezes por dia e o painel
			// viraria ruído — que é como um alarme real deixa de ser lido.
			// Reemite só quando o CONJUNTO de sinais muda (inclusive para vazio,
			// quando a conversa se resolve).
			if ((meta.reconciliacao?.sinais ?? "") === assinatura) continue;

			await persistMeta(linha.id, { ...meta, reconciliacao: { sinais: assinatura } });
			if (scores.length === 0) continue;

			publicar(linha.id, scores);
			publicadas += 1;
			for (const s of scores) sinais[s.name] = (sinais[s.name] ?? 0) + 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "reconciliacao",
					conversation_id: linha.id,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	return { publicadas, sinais };
}

function publicarNoLangfuse(
	conversationId: string,
	scores: ReturnType<typeof scoresDeReconciliacao>,
): void {
	// Log estruturado sempre: o alarme não pode depender só do Langfuse estar de pé.
	console.log(
		JSON.stringify({
			source: "reconciliacao",
			conversation_id: conversationId,
			sinais: scores.map((s) => s.name),
		}),
	);
	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scores) {
			// Score de SESSÃO — o defeito é da conversa inteira, não de um turno.
			client.score.create({ ...score, sessionId: conversationId, environment });
		}
	} catch (err) {
		console.error("[reconciliacao] publicação falhou (ignorado):", err);
	}
}
