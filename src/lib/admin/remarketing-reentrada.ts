/**
 * A REENTRADA DO BOLO PARADO — o I/O (server-only).
 *
 * A decisão mora em `src/lib/remarketing/reentrada.ts` (pura). Aqui ficam
 * exatamente as três coisas que exigem servidor: **ler** os candidatos, **decidir
 * em lote** com a MESMA função pura e **gravar** o resultado — a linha reaberta e
 * o rastro de quem autorizou.
 *
 * ── O recorte dos candidatos ────────────────────────────────────────────────
 *
 * O bolo parado é todo mundo cujo silêncio é maior que o piso de 90 min — SEM o
 * teto de 7 dias da entrada normal. O silêncio é o MESMO fato da entrada (D9):
 * na web, o MAIS RECENTE entre a última FALA do cliente (`messages.role='user'`)
 * e o `last_inbound_at` (a coluna pode chegar quando a conversa vira lead); no
 * WhatsApp, o próprio `last_inbound_at`. Sem isso, o lead da web nem entrava no
 * recorte — a reentrada manual dele era impossível, não só recusada.
 *
 * A consulta só PRÉ-FILTRA (o piso de silêncio tem índice); quem decide é
 * `avaliarReentrada`, a mesma função que a tela usa para dizer quantas vão
 * entrar e por que o resto fica de fora. Um `CASE WHEN` em SQL daria duas
 * verdades para a mesma pergunta.
 *
 * O `LIMIT` é teto de trabalho (não filtro): a ação é deliberada e em lote, e o
 * preview diz se o recorte foi truncado.
 *
 * ── A gravação é idempotente por construção ─────────────────────────────────
 *
 * O índice único por conversa já existe (`remarketing_touches_conversation_id_idx`).
 * A escrita é um UPSERT que só muda a linha quando ela está `ESGOTADO` — a
 * linha que já está `ATIVO` (ou que respondeu) não é tocada, mesmo que dois
 * cliques cheguem juntos. E `touches_30d` NÃO entra no `SET`: a cota de 30 dias
 * CONTA o histórico, então a reabertura preserva o que a pessoa já consumiu
 * (decisão do dono, 28/09 — ver o topo de `lib/remarketing/reentrada.ts`).
 *
 * ── O rastro de quem autorizou ──────────────────────────────────────────────
 *
 * Vai em `conversations.metadata.remarketingAcao` (`tipo: "reentrada"`), o mesmo
 * lugar do rastro de segurar/soltar — sem coluna nova, sem migration.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { remarketingTouches } from "@/db/schema";
import { persistMeta, reloadMeta } from "@/lib/conversation/meta";
import {
	ehObjetivoConhecido,
	OBJETIVO_DESCONHECIDO,
	objetivoCanonico,
} from "@/lib/remarketing/motor";
import {
	agregarReentrada,
	autorizacaoDaReentrada,
	avaliarReentrada,
	type ConversaParaReentrada,
} from "@/lib/remarketing/reentrada";
import { ESPERA_SILENCIO_MS, type StatusRegua } from "@/lib/remarketing/regua";
import { opcoesDoAmbiente } from "./motivo-fora-da-regua";
import { telefonesDaEquipe } from "./regua-por-conversa";

/** Teto de conversas avaliadas por lote — trabalho, não elegibilidade. */
const CANDIDATOS_POR_LOTE = 500;

/**
 * A janela de ATIVIDADE do recorte da reentrada (FIX-441/D12).
 *
 * A reentrada NÃO tem o teto de 7 dias da entrada normal — ela existe para
 * reabrir quem ficou de fora dele. Mas o `LEFT JOIN LATERAL max(messages…)`
 * rodava para TODAS as conversas da base. O pré-filtro (que não depende do
 * LATERAL) limita a varredura a quem teve QUALQUER atividade nos últimos 30
 * dias; quem está dormente há mais que isso sai do recorte — e o `LIMIT` já
 * dizia que o lote é teto de trabalho.
 */
const JANELA_DE_REENTRADA_MS = 30 * 24 * 60 * 60 * 1000;

/** O candidato já com o que a GRAVAÇÃO precisa (a decisão só vê `conversa`). */
interface Candidato {
	conversationId: string;
	conversa: ConversaParaReentrada;
	/** O que a conversa revelou do bem — escolhe a arte/template do toque. */
	metadata: unknown;
	/** Objetivo atual da linha (reserva quando a metadata não revela o bem). */
	objetivoGravado: string | null;
	/** Cota atual da linha — preservada na reabertura (a cota CONTA o histórico). */
	touches30d: number;
}

export interface PreviewDaReentrada {
	/** Quantas conversas foram avaliadas (o recorte). */
	avaliadas: number;
	/** Quantas vão entrar / entraram. */
	entram: number;
	/** Quantas ficam de fora, por motivo (as chaves são os motivos). */
	ficaramDeFora: Record<string, number>;
	/** O recorte bateu no teto e pode haver mais paradas além dele. */
	truncado: boolean;
}

function linhasDeExecucao(resultado: unknown): Array<Record<string, unknown>> {
	const rows = Array.isArray(resultado)
		? resultado
		: ((resultado as { rows?: unknown[] })?.rows ?? []);
	return rows as Array<Record<string, unknown>>;
}

/** O bem que a conversa revelou, se revelou — `null` quando não se sabe. */
function objetivoDaMetadata(metadata: unknown): string | null {
	const categoria = (metadata as { currentCategory?: string } | null)?.currentCategory;
	if (!categoria) return null;
	return ehObjetivoConhecido(categoria) ? objetivoCanonico(categoria) : null;
}

/**
 * O recorte: conversas com silêncio maior que o piso de 90 min, SEM a janela de
 * 7 dias. Traz contato, opt-out, metadata e a linha da régua quando existe.
 */
async function candidatosDaReentrada(agora: Date, limite: number): Promise<Candidato[]> {
	const piso = new Date(agora.getTime() - ESPERA_SILENCIO_MS).toISOString();
	const desde = new Date(agora.getTime() - JANELA_DE_REENTRADA_MS).toISOString();
	const linhas = linhasDeExecucao(
		await db.execute(sql`
			SELECT c.id AS "conversationId", c.channel, c.status,
			       c.is_simulated AS "isSimulated", c.contact_id AS "contactId",
			       c.wa_id AS "waId", c.last_inbound_at AS "lastInboundAt", c.metadata,
			       CASE WHEN c.channel = 'web' THEN fala.em END AS "ultimaMensagemDoClienteEm",
			       ct.phone, ct.remarketing_optout_at AS "optoutDaPessoaEm",
			       t.status AS "reguaStatus", t.motivo_saida AS "reguaMotivoSaida",
			       t.objetivo AS "reguaObjetivo", t.touches_30d AS "touches30d"
			FROM conversations c
			LEFT JOIN contacts ct ON ct.id = c.contact_id
			LEFT JOIN LATERAL (
			    SELECT max(m.created_at) AS em FROM messages m
			     WHERE m.conversation_id = c.id AND m.role = 'user'
			) fala ON true
			LEFT JOIN remarketing_touches t ON t.conversation_id = c.id
			WHERE (
			    -- PRÉ-FILTRO (FIX-441/D12): não depende do LATERAL e é superset das
			    -- condições finais — o planner o empurra para c antes do max.
			    c.last_inbound_at >= ${desde}::timestamptz
			    OR c.created_at >= ${desde}::timestamptz
			    OR c.updated_at >= ${desde}::timestamptz
			    OR EXISTS (
			        SELECT 1 FROM messages m2
			         WHERE m2.conversation_id = c.id AND m2.role = 'user'
			           AND m2.created_at >= ${desde}::timestamptz
			    )
			)
			  AND coalesce(c.last_inbound_at, fala.em) IS NOT NULL
			  AND coalesce(c.last_inbound_at, fala.em) <= ${piso}::timestamptz
			ORDER BY coalesce(c.last_inbound_at, fala.em) DESC NULLS LAST
			LIMIT ${limite}
		`),
	);

	return linhas.map((l) => {
		const reguaStatus = (l.reguaStatus as StatusRegua | null) ?? null;
		return {
			conversationId: String(l.conversationId),
			conversa: {
				channel: (l.channel as "web" | "whatsapp") ?? "whatsapp",
				status: l.status as ConversaParaReentrada["status"],
				isSimulated: l.isSimulated === true,
				contactId: (l.contactId as string | null) ?? null,
				lastInboundAt: l.lastInboundAt ? new Date(l.lastInboundAt as string) : null,
				ultimaMensagemDoClienteEm: l.ultimaMensagemDoClienteEm
					? new Date(l.ultimaMensagemDoClienteEm as string)
					: null,
				waId: (l.waId as string | null) ?? null,
				phone: (l.phone as string | null) ?? null,
				jaNaRegua: reguaStatus !== null,
				optoutDaPessoaEm: l.optoutDaPessoaEm ? new Date(l.optoutDaPessoaEm as string) : null,
				regua: reguaStatus
					? { status: reguaStatus, motivoSaida: (l.reguaMotivoSaida as string | null) ?? null }
					: null,
			},
			metadata: l.metadata,
			objetivoGravado: (l.reguaObjetivo as string | null) ?? null,
			touches30d: Number(l.touches30d ?? 0),
		};
	});
}

/** O objetivo a gravar: metadata ao vivo > o que a linha já tinha > desconhecido. */
function objetivoDoCandidato(c: Candidato): string {
	return objetivoDaMetadata(c.metadata) ?? c.objetivoGravado ?? OBJETIVO_DESCONHECIDO;
}

/**
 * Decide o lote inteiro. `dryRun` (default) NÃO escreve nada — é o preview que a
 * tela mostra antes de confirmar.
 *
 * Devolve o resumo e, quando não é dry-run, quantas linhas foram de fato
 * reabertas. A diferença entre "poderia reabrir" e "reabriu" importa: o UPSERT
 * só muda linha `ESGOTADO`, então uma corrida (outro clique, o ciclo) pode ter
 * mudado o estado no meio — e o número precisa dizer o que aconteceu.
 */
export async function reentrarEmLote(args: {
	agora: Date;
	por: string;
	porId: string;
	dryRun?: boolean;
}): Promise<PreviewDaReentrada> {
	const { agora, por, porId } = args;
	const candidatos = await candidatosDaReentrada(agora, CANDIDATOS_POR_LOTE);
	const opcoes = opcoesDoAmbiente();
	const ehEquipe = await telefonesDaEquipe();

	const vereditos = candidatos.map((c) => {
		const telefone = c.conversa.waId ?? c.conversa.phone;
		return avaliarReentrada(c.conversa, agora, {
			...opcoes,
			telefoneDaEquipe: telefone ? ehEquipe(telefone) : false,
		});
	});

	const agregado = agregarReentrada(vereditos);
	const resumo: PreviewDaReentrada = {
		avaliadas: agregado.avaliadas,
		entram: agregado.entram,
		ficaramDeFora: agregado.motivos,
		truncado: candidatos.length >= CANDIDATOS_POR_LOTE,
	};
	if (args.dryRun !== false) return resumo;

	const autorizacao = autorizacaoDaReentrada(por, porId, agora);
	let entraram = 0;

	for (let i = 0; i < candidatos.length; i++) {
		if (!vereditos[i]?.reentra) continue;
		const c = candidatos[i];
		const conversationId = c.conversationId;

		try {
			const gravadas = await db
				.insert(remarketingTouches)
				.values({
					conversationId,
					contactId: c.conversa.contactId as string,
					objetivo: objetivoDoCandidato(c),
					step: 0,
					status: "ATIVO",
					nextTouchAt: agora,
					touches30d: c.touches30d,
				})
				// Só reabre linha ESGOTADO. Linha ATIVO/respondida/converteu não é
				// tocada — é o que torna o segundo clique inofensivo.
				.onConflictDoUpdate({
					target: remarketingTouches.conversationId,
					set: {
						status: "ATIVO",
						step: 0,
						nextTouchAt: agora,
						motivoSaida: null,
						updatedAt: agora,
					},
					setWhere: eq(remarketingTouches.status, "ESGOTADO"),
				})
				.returning({ id: remarketingTouches.id });

			if (gravadas.length === 0) continue;

			// O rastro de QUEM autorizou e QUANDO vai no metadata da conversa.
			const meta = await reloadMeta(conversationId);
			await persistMeta(conversationId, Object.assign({}, meta, { remarketingAcao: autorizacao }));
			entraram += 1;
		} catch (err) {
			console.error(
				JSON.stringify({
					level: "error",
					source: "remarketing-reentrada",
					etapa: "gravar",
					conversation_id: conversationId,
					error: err instanceof Error ? err.message : String(err),
				}),
			);
		}
	}

	return { ...resumo, entram: entraram };
}
