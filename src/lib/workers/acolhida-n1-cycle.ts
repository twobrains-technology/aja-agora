// O ciclo da ACOLHIDA N1 — o cliente que está com a mesa, voltou a escrever e
// ainda não foi atendido por gente.
//
// Espelha `runRetomadaCycle` de propósito: mesmo formato de deps injetáveis,
// mesmo turno de servidor pelo grafo, mesmo "grava o contador ANTES de
// disparar". A crítica do especialista foi explícita — não é um caminho novo, é
// o watchdog que já existe com outro gatilho e outro directive. Um segundo
// mecanismo de retomada seria mais uma regra escrita duas vezes, que é a causa
// estrutural apurada no dossiê de 2026-08-15.
//
// ## A diferença que importa em relação à retomada
//
// Aqui existe um HUMANO no caso. O invariante de 2026-08-10 (o agente não fala
// por cima de quem atende) é o que este ciclo mais arrisca, porque a geração
// leva 3–8 s e três das respostas reais da mesa vieram em menos de 1 minuto.
// Por isso a decisão é consultada DUAS vezes: uma para escolher a conversa, e
// outra — com `ultimaFalaDaMesaEm` relido do banco — imediatamente antes de
// emitir. Entre as duas, a mesa pode ter falado.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, messages } from "@/db/schema";
import { metaOf, persistMeta } from "@/lib/conversation/meta";
import { buildAcolhidaN1Directive, decidirAcolhidaN1, ehFalaDaMesa } from "@/lib/mesa/acolhida-n1";

/** Teto de conversas por ciclo — o mesmo espírito do `RETOMADAS_POR_CICLO`. */
const ACOLHIDAS_POR_CICLO = 20;

/**
 * Só conversas cujo inbound do cliente está dentro da janela de 24 h da Meta.
 *
 * Fora dela o WhatsApp não entrega texto livre (só template aprovado) — acolher
 * tardiamente é outra feature, com template e mesa. De quebra, limita o scan.
 */
const JANELA_META_HORAS = 24;

export type LinhaEsperandoMesa = {
	id: string;
	channel: "web" | "whatsapp";
	waId: string | null;
	contactName: string | null;
	metadata: unknown;
	ultimoInboundEm: Date;
};

/**
 * Conversas entregues à mesa em que a última mensagem do cliente ainda está
 * dentro da janela da Meta.
 *
 * A query NÃO decide se a mesa respondeu: ela devolve candidatas, e quem decide
 * é `ehFalaDaMesa` no TypeScript. Reimplementar o predicado em SQL o poria em
 * duas cópias — e a cópia SQL não saberia da nota `[sistema]`, que foi
 * exatamente o defeito apontado na crítica.
 */
export async function findConversasEsperandoAMesa(now: Date): Promise<LinhaEsperandoMesa[]> {
	const rows = await db.execute(sql`
		WITH ultimo_inbound AS (
			SELECT m.conversation_id, max(m.created_at) AS em
			FROM messages m
			WHERE m.role = 'user'
			  AND m.created_at > ${now.toISOString()}::timestamptz - interval '${sql.raw(String(JANELA_META_HORAS))} hours'
			GROUP BY m.conversation_id
		)
		SELECT c.id, c.channel, c.wa_id AS "waId", c.contact_name AS "contactName",
		       c.metadata, u.em AS "ultimoInboundEm"
		FROM conversations c
		JOIN ultimo_inbound u ON u.conversation_id = c.id
		WHERE c.status = 'handed_off'
		  AND c.is_simulated = false
		ORDER BY u.em DESC
		LIMIT ${ACOLHIDAS_POR_CICLO}
	`);
	return (
		Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])
	) as LinhaEsperandoMesa[];
}

/**
 * Quando a mesa falou por último nesta conversa, em milissegundos — ou `null` se
 * nunca falou.
 *
 * Traz as candidatas (`assistant` sem persona) e aplica `ehFalaDaMesa`, que é
 * quem sabe descartar a nota de sistema do `/fim`.
 */
export async function ultimaFalaDaMesaEm(conversationId: string): Promise<number | null> {
	const candidatas = await db
		.select({
			role: messages.role,
			personaId: messages.personaId,
			content: messages.content,
			createdAt: messages.createdAt,
		})
		.from(messages)
		.where(and(eq(messages.conversationId, conversationId), isNull(messages.personaId)))
		.orderBy(desc(messages.createdAt))
		.limit(10);

	for (const m of candidatas) {
		if (ehFalaDaMesa(m)) return m.createdAt.getTime();
	}
	return null;
}

/** A proposta real registrada para a conversa — o único número que a acolhida
 * pode citar. Sem linha aqui, o directive proíbe explicitamente afirmar que
 * existe proposta. */
export async function propostaDaConversa(conversationId: string) {
	const [p] = await db
		.select({
			administradora: beviProposals.administradora,
			creditValue: beviProposals.creditValue,
			monthlyPayment: beviProposals.monthlyPayment,
			termMonths: beviProposals.termMonths,
		})
		.from(beviProposals)
		.where(eq(beviProposals.conversationId, conversationId))
		.orderBy(desc(beviProposals.createdAt))
		.limit(1);
	if (!p) return null;
	return {
		administradora: p.administradora,
		creditValue: p.creditValue === null ? null : Number(p.creditValue),
		monthlyPayment: p.monthlyPayment === null ? null : Number(p.monthlyPayment),
		termMonths: p.termMonths,
	};
}

/** Dispara o turno de servidor. Injetável para o ciclo ser testável sem tocar a
 * Meta API nem subir o grafo — mesmo contrato do `DisparaRetomada`. */
export type DisparaAcolhida = (args: {
	conversationId: string;
	channel: "web" | "whatsapp";
	waId: string | null;
	directive: string;
}) => Promise<void>;

export type AcolhidaDeps = {
	now?: Date;
	dispara?: DisparaAcolhida;
	/** Injetáveis para o teste de corrida: o ciclo relê a fala da mesa entre
	 * decidir e emitir, e é aí que o invariante é protegido. */
	lerUltimaFalaDaMesa?: (conversationId: string) => Promise<number | null>;
	lerProposta?: typeof propostaDaConversa;
	listar?: (now: Date) => Promise<LinhaEsperandoMesa[]>;
};

export async function runAcolhidaN1Cycle(
	deps: AcolhidaDeps = {},
): Promise<{ acolhidas: number; puladas: Record<string, number> }> {
	const now = deps.now ?? new Date();
	const listar = deps.listar ?? findConversasEsperandoAMesa;
	const lerMesa = deps.lerUltimaFalaDaMesa ?? ultimaFalaDaMesaEm;
	const lerProposta = deps.lerProposta ?? propostaDaConversa;
	const dispara = deps.dispara ?? disparaAcolhidaReal;

	const linhas = await listar(now);
	let acolhidas = 0;
	const puladas: Record<string, number> = {};
	const pular = (motivo: string) => {
		puladas[motivo] = (puladas[motivo] ?? 0) + 1;
	};

	for (const linha of linhas) {
		try {
			const meta = metaOf(linha);
			const inboundEm = new Date(linha.ultimoInboundEm).getTime();
			const proposta = await lerProposta(linha.id);

			const decisao = decidirAcolhidaN1({
				meta,
				agora: now.getTime(),
				ultimoInboundDoClienteEm: inboundEm,
				ultimaFalaDaMesaEm: await lerMesa(linha.id),
				temPropostaReal: proposta !== null,
			});
			if (!decisao.acolher) {
				pular(decisao.motivo);
				continue;
			}

			const directive = buildAcolhidaN1Directive(meta, { proposta });

			// GRAVA ANTES DE DISPARAR — mesma doutrina da retomada: turno que morre no
			// meio continua contado, senão o watchdog persegue justamente a conversa
			// que está quebrando.
			await persistMeta(linha.id, {
				...meta,
				acolhidaN1: { attempts: (meta.acolhidaN1?.attempts ?? 0) + 1, lastAt: now.getTime() },
			});

			// RE-CHECAGEM IMEDIATAMENTE ANTES DE EMITIR.
			//
			// É este bloco que protege o invariante de 2026-08-10. Entre a decisão
			// acima e este ponto houve I/O; se o atendente falou nesse intervalo, a
			// acolhida sairia POR CIMA dele — o dano pior. O contador já foi gravado
			// e não é revertido de propósito: perder uma acolhida é barato, falar por
			// cima de quem atende não é.
			const mesaAgora = await lerMesa(linha.id);
			if (mesaAgora !== null && mesaAgora >= inboundEm) {
				pular("mesa-respondeu-durante");
				continue;
			}

			await dispara({
				conversationId: linha.id,
				channel: linha.channel,
				waId: linha.waId,
				directive,
			});
			acolhidas += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "acolhida-n1",
					conversation_id: linha.id,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	return { acolhidas, puladas };
}

/** A acolhida real: turno de servidor no runtime de verdade, pelo mesmo caminho
 * do directive da retomada. */
const disparaAcolhidaReal: DisparaAcolhida = async ({
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

/** Conversas em que a acolhida foi decidida mas o ciclo não pôde falar. Exposto
 * para o sinal do Langfuse (`n1_acolhida_pulada`). */
export const _internals = { ACOLHIDAS_POR_CICLO, JANELA_META_HORAS };
