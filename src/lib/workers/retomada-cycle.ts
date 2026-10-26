// O WATCHDOG DA CONVERSA SEM RESPOSTA — o cliente falou e ninguém respondeu.
//
// Morava no worker de gates (`gate-reengage-poll.ts:296` na main) e saiu junto
// com ele. O que ele entregava NÃO era funil: era a única fonte que enxerga a
// conversa pelo estado OBSERVÁVEL — a última mensagem é do cliente e faz tempo.
//
// A diferença para as outras duas fontes de retomada importa:
//
//  · a régua de remarketing (`remarketing-cycle`) exige entrada de contato,
//    flag de opt-in e horário comercial; é follow-up de marketing, não resgate
//    de conversa aberta;
//  · o marcador de pendência do funil morreu com o funil (e dependia de o turno
//    ter rodado para escrevê-lo: turno que morre no meio não deixava marcador).
//
// Esta fonte não depende de escrita nenhuma. Ela lê `messages`, e só.
//
// A janela de 24 h é regra de negócio, não estética: fora dela o WhatsApp não
// entrega texto livre (só template aprovado), então retomada tardia é outra
// feature — com template e mesa —, não este worker. De quebra, limita o scan.

import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { ConversationMetadata } from "@/lib/agent/personas";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import {
	buildRetomadaDirective,
	type OfertaDaRetomada,
	podeRetomar,
	resolverOfertaDaRetomada,
} from "./retomada";

/** Quanto tempo de silêncio, por canal, antes de a conversa virar candidata a
 * retomada. Web é mais curto porque o cliente está com a tela aberta e a
 * atenção dura pouco; WhatsApp tem outro ritmo e 90 s ali soaria afobado. */
export const IDLE_RETOMADA_MS = {
	web: Number(process.env.RETOMADA_IDLE_WEB_MS ?? 2 * 60_000),
	whatsapp: Number(process.env.RETOMADA_IDLE_WHATSAPP_MS ?? 5 * 60_000),
};

/** Conversas por ciclo — o scan é limitado, e o mais antigo vem primeiro. */
export const RETOMADAS_POR_CICLO = Number(process.env.RETOMADAS_POR_CICLO ?? 5);

/** Janela da Meta para texto livre. Ver o cabeçalho. */
const JANELA_META_HORAS = 24;

export type LinhaSemResposta = {
	id: string;
	channel: "web" | "whatsapp";
	waId: string | null;
	contactName: string | null;
	metadata: unknown;
};

/**
 * A conversa encerrada NÃO é do agente — quem conduz é a mesa, o contrato ou a
 * coleta de lead. Não é instrumento de funil: é o estado terminal da conversa,
 * e retomar por cima dele é o incidente de 2026-08-10 (o agente falando depois
 * de quem atende).
 */
function conversaEncerrada(meta: ConversationMetadata): boolean {
	return Boolean(meta.handoffSuggested || meta.contractClosed || meta.leadCollection);
}

/**
 * Conversas ATIVAS cuja ÚLTIMA mensagem é do cliente e que estão paradas além do
 * teto do canal.
 *
 * Não depende de marcador escrito pelo turno: se o turno morreu no meio (ou
 * nunca rodou), a conversa continua visível aqui. Já aconteceu — cliente
 * escreveu três vezes e não houve trace nenhum, nem do agente nem da mesa.
 */
export async function findConversasSemResposta(now: Date): Promise<LinhaSemResposta[]> {
	const rows = await db.execute(sql`
		WITH ultimas AS (
			SELECT DISTINCT ON (m.conversation_id)
			       m.conversation_id, m.role, m.created_at
			FROM messages m
			WHERE m.created_at > ${now.toISOString()}::timestamptz - interval '${sql.raw(String(JANELA_META_HORAS))} hours'
			ORDER BY m.conversation_id, m.created_at DESC
		)
		SELECT c.id, c.channel, c.wa_id AS "waId", c.contact_name AS "contactName", c.metadata
		FROM conversations c
		JOIN ultimas u ON u.conversation_id = c.id
		WHERE c.status = 'active'
		  AND c.is_simulated = false
		  AND u.role = 'user'
		  AND u.created_at < ${now.toISOString()}::timestamptz - (
		        CASE c.channel
		          WHEN 'web' THEN ${`${IDLE_RETOMADA_MS.web} milliseconds`}::interval
		          ELSE ${`${IDLE_RETOMADA_MS.whatsapp} milliseconds`}::interval
		        END)
		ORDER BY u.created_at DESC
		LIMIT ${RETOMADAS_POR_CICLO}
	`);
	return (
		Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
	) as LinhaSemResposta[];
}

/** Dispara um turno de SERVIDOR na conversa. Injetável para o ciclo ser testável
 * sem tocar a Meta API nem subir o motor do vendedor. */
export type DisparaRetomada = (args: {
	conversationId: string;
	channel: "web" | "whatsapp";
	waId: string | null;
	directive: string;
}) => Promise<void>;

export type RetomadaDeps = {
	now?: Date;
	dispara?: DisparaRetomada;
	/** Injetável para o teste não depender de artifacts no banco. */
	lerOferta?: (
		conversationId: string,
		meta: ConversationMetadata,
	) => Promise<OfertaDaRetomada | null>;
};

/**
 * Um ciclo: para cada conversa em que o cliente falou por último, dispara UMA
 * retomada — respeitando o teto e o backoff (`podeRetomar`).
 */
export async function runRetomadaCycle(deps: RetomadaDeps = {}): Promise<{ retomadas: number }> {
	const now = deps.now ?? new Date();
	const dispara = deps.dispara ?? disparaRetomadaReal;
	const lerOferta = deps.lerOferta ?? resolverOfertaDaRetomada;
	const rows = await findConversasSemResposta(now);
	let retomadas = 0;

	for (const row of rows) {
		try {
			const meta = metaOf(row);
			if (conversaEncerrada(meta)) continue;
			if (!podeRetomar(meta, now.getTime())) continue;

			const minutosParado = Math.max(
				1,
				Math.round((IDLE_RETOMADA_MS[row.channel] ?? IDLE_RETOMADA_MS.web) / 60_000),
			);
			// A oferta vem do que o vendedor gravou ou, sem ele, da última carta que
			// o cliente viu — retomada sem oferta é retomada no vazio.
			const oferta = await lerOferta(row.id, meta);
			const directive = buildRetomadaDirective(meta, {
				minutosParado,
				channel: row.channel,
				oferta,
			});

			// GRAVA ANTES DE DISPARAR. Se o turno morrer no meio, a tentativa continua
			// contada — um watchdog que só conta sucesso vira loop exatamente na
			// conversa que está quebrando, e aí o defeito persegue o cliente.
			await persistMeta(row.id, {
				...meta,
				retomada: { attempts: (meta.retomada?.attempts ?? 0) + 1, lastAt: now.getTime() },
			});

			await dispara({
				conversationId: row.id,
				channel: row.channel,
				waId: row.waId,
				directive,
			});
			retomadas += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "retomada",
					conversation_id: row.id,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	return { retomadas };
}

/** A retomada real: turno de SERVIDOR pelo motor do vendedor livre. No WhatsApp o
 * adapter entrega pela Meta API; no web o `persist` grava a mensagem e o cliente a
 * recebe no próximo poll/resume. Nada de texto enlatado por fora do motor. */
const disparaRetomadaReal: DisparaRetomada = async ({
	conversationId,
	channel,
	waId,
	directive,
}) => {
	if (channel === "whatsapp") {
		if (!waId) return;
		const { runDirectiveWithOrchestrator } = await import("@/lib/whatsapp/adapter");
		await runDirectiveWithOrchestrator({ from: waId, conversationId, directive });
		return;
	}
	const { runTurn } = await import("@/lib/agent/orchestrator");
	for await (const _ of runTurn({
		channel: "web",
		conversationId,
		userText: directive,
		isUserTurn: false,
	})) {
		// Drenar é o que faz o turno acontecer; o `persist` grava a fala.
	}
};
