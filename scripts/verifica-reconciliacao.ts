// Os scores de reconciliação de UMA conversa, calculados sobre o estado real.
//
// Existe porque `runReconciliacaoCycle` varre a produção (`is_simulated =
// false`) e nunca olha para as conversas do simulador — que são justamente as
// que uma sonda produz. Sem isto, "os scores estão em zero" seria uma afirmação
// sobre uma conversa que o ciclo nem visitou: verde por ausência, que é o modo
// de falha que este projeto já pagou caro.
//
// Aqui o estado é lido da MESMA forma que o ciclo lê (a query é a mesma, presa
// a uma conversa) e passado pela MESMA função de decisão
// (`scoresDeReconciliacao`). O que se prova é o veredito, não o caminho.
//
// Uso:
//   pnpm verifica:reconciliacao <conversationId>

import "./_env-host";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
	type EstadoParaReconciliacao,
	scoresDeReconciliacao,
} from "@/lib/observability/reconciliacao-fala-estado";

async function estadoDa(conversationId: string): Promise<EstadoParaReconciliacao> {
	const rows = await db.execute(sql`
		WITH decisao AS (
			SELECT m.conversation_id, min(a.created_at) AS em
			FROM artifacts a
			JOIN messages m ON m.id = a.message_id
			WHERE a.type IN ('decision_prompt', 'two_paths')
			  AND m.conversation_id = ${conversationId}
			GROUP BY m.conversation_id
		),
		contrato AS (
			SELECT DISTINCT m.conversation_id
			FROM artifacts a
			JOIN messages m ON m.id = a.message_id
			WHERE a.type = 'contract_form' AND m.conversation_id = ${conversationId}
		)
		SELECT c.metadata->>'maxStageReached' AS "maxStageReached",
		       d.em AS "decisaoOferecidaEm",
		       (ct.conversation_id IS NOT NULL) AS "contratoOferecido",
		       coalesce((
		         SELECT count(*) FROM messages um
		         WHERE um.conversation_id = c.id AND um.role = 'user'
		           AND d.em IS NOT NULL AND um.created_at > d.em
		       ), 0)::int AS "mensagensDoUsuarioAposDecisao",
		       coalesce((
		         SELECT count(*) FROM bevi_proposals p WHERE p.conversation_id = c.id
		       ), 0)::int AS "propostas"
		FROM conversations c
		LEFT JOIN decisao d ON d.conversation_id = c.id
		LEFT JOIN contrato ct ON ct.conversation_id = c.id
		WHERE c.id = ${conversationId}
	`);
	const linha = (Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? []))[0] as
		| EstadoParaReconciliacao
		| undefined;
	if (!linha) throw new Error(`conversa ${conversationId} não encontrada`);
	return linha;
}

async function main() {
	const id = process.argv[2];
	if (!id) {
		console.error("uso: pnpm verifica:reconciliacao <conversationId>");
		process.exitCode = 2;
		return;
	}

	const estado = await estadoDa(id);
	console.log(`Conversa ${id}\n`);
	console.log("ESTADO");
	console.log(`  maxStageReached ................. ${estado.maxStageReached}`);
	console.log(`  decisão oferecida em ........... ${estado.decisaoOferecidaEm ?? "nunca"}`);
	console.log(`  contract_form oferecido ........ ${estado.contratoOferecido}`);
	console.log(`  turnos do cliente pós-decisão .. ${estado.mensagensDoUsuarioAposDecisao}`);
	console.log(`  propostas na administradora .... ${estado.propostas}`);

	const scores = scoresDeReconciliacao(estado);
	console.log("\nSCORES DE RECONCILIAÇÃO");
	for (const nome of ["funil_travado_no_fecho", "venda_prometida_sem_proposta"]) {
		const s = scores.find((x) => x.name === nome);
		console.log(`  ${s ? "❌" : "✅"} ${nome} = ${s ? s.value : 0}`);
		if (s) console.log(`       ${s.comment}`);
	}
	process.exitCode = scores.length === 0 ? 0 : 1;
}

void main().then(
	() => process.exit(process.exitCode ?? 0),
	(e) => {
		console.error(`✗ ${(e as Error).message}`);
		process.exit(2);
	},
);
