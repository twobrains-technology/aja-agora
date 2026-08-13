// Scores de CONDUÇÃO — a tradução para Langfuse do predicado que vive em
// `@/lib/agent/conducao`.
//
// Por que o predicado não mora aqui: ele tem dois consumidores que não podem
// discordar — este score e o marcador de pendência do watchdog (`persist.ts`).
// Duas definições da mesma pergunta divergem em silêncio.
//
// Por que o score existe além do `turno_mudo`: na sessão `ff8f2080` (produção
// 2026-08-13) o cliente recebeu cinco cards de oferta e "Excelente, Kairo! Um
// instante." Todo sinal determinístico ficou verde, porque todos medem BYTES:
// `turno_mudo` = 0 (escreveu 30 caracteres), `card_sem_fala` = 0 (houve fala e
// card), `artefato_suprimido` = 0. O único que pegou foi um juiz de LLM — e
// juiz é hipótese até bater com dado determinístico. Este é o dado.
//
// Booleano de propósito: a média vira "taxa de condução" num widget só, e cruza
// de graça com `conducao_ausente_gate` (onde afunda) e com `traceName`
// (`turn:web` × `turn:whatsapp`).
import {
	artifactsDosEventos,
	type FlagsDeConducao,
	turnoEntregouConducao,
} from "@/lib/agent/conducao";
import type { TurnEvent } from "@/lib/agent/orchestrator/types";
import { getLangfuseClient } from "./client";
import { ambienteLangfuse } from "./env";
import type { Score } from "./funil-scores";

export type CondicaoDeConducao = FlagsDeConducao & {
	eventos: readonly TurnEvent[];
	/** Gate ativo quando faltou condução — a dimensão que aponta o arquivo. */
	gateAtivo?: string | null;
};

export function scoresDeConducao(cond: CondicaoDeConducao): Score[] {
	const conduziu = turnoEntregouConducao(cond.eventos, cond);
	// `null` = a pergunta não se aplica (turno de servidor, conversa encerrada).
	// Alerta que grita à toa é alerta que ninguém olha.
	if (conduziu === null) return [];

	const artifacts = artifactsDosEventos(cond.eventos);
	const scores: Score[] = [
		{
			name: "conducao_entregue",
			value: conduziu ? 1 : 0,
			dataType: "BOOLEAN",
			...(conduziu ? {} : { comment: artifacts.join(", ") || "sem artifact" }),
		},
	];
	if (!conduziu && cond.gateAtivo) {
		scores.push({
			name: "conducao_ausente_gate",
			value: cond.gateAtivo,
			dataType: "CATEGORICAL",
		});
	}
	return scores;
}

/**
 * Uma tool RECUSOU o pedido do modelo (respondeu `{error}` com sucesso).
 *
 * Recusa não é falha de infraestrutura — a tool rodou e disse "não dá" —, e por
 * isso escapava de tudo: `lerFalhaDeTool` só olha `status: "error"` e
 * `tools_chamadas` conta a chamada sem saber o que ela respondeu. Na sessão
 * `ff8f2080` foram DUAS recusas seguidas (`ajustar_por_parcela` e
 * `simulate_quota`, as duas por lerem o banco antes do `persist` do próprio
 * turno gravar a oferta) e o painel não registrou nenhuma. Elas consumiram três
 * das quatro chamadas de modelo do turno.
 */
export function scoresDeToolRecusada(tools: string[]): Score[] {
	return [
		{
			name: "tool_recusou",
			value: tools.length > 0 ? 1 : 0,
			dataType: "BOOLEAN",
			...(tools.length > 0 ? { comment: tools.join(", ") } : {}),
		},
	];
}

/** Publica no trace ATIVO. Observabilidade nunca derruba o turno: sem
 * credencial é no-op, e qualquer erro é engolido com log. */
function publicar(scores: Score[], onde: string): void {
	if (scores.length === 0) return;
	const client = getLangfuseClient();
	if (!client) return;
	try {
		const environment = ambienteLangfuse();
		for (const score of scores) client.score.activeTrace({ ...score, environment });
	} catch (err) {
		console.error(`[langfuse] ${onde} falhou (ignorado):`, err);
	}
}

export function registrarConducao(cond: CondicaoDeConducao): void {
	publicar(scoresDeConducao(cond), "registrar condução");
}

export function registrarToolsRecusadas(tools: string[]): void {
	publicar(scoresDeToolRecusada(tools), "registrar tool recusada");
}
