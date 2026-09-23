import { and, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
	contacts,
	conversationEvaluations,
	conversations,
	messages,
	remarketingTouches,
	user as userTable,
} from "@/db/schema";
import { condicaoDeOrigem } from "@/lib/admin/filtro-origem";
import { marcarConversasComoTeste } from "@/lib/admin/limpeza-queries";
import {
	avaliarRegua,
	type FatosDaConversa,
	telefonesDaEquipe,
} from "@/lib/admin/regua-por-conversa";
import { requireRole } from "@/lib/admin/require-role";
import { conversaIdentificada } from "@/lib/admin/sinais-do-funil";
import type { StatusRegua } from "@/lib/remarketing/regua";

const CHANNELS = ["web", "whatsapp"] as const;
const STATUSES = ["active", "handed_off", "closed"] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseLimit(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
	return Math.min(Math.floor(n), MAX_LIMIT);
}

function parseOffset(raw: string | null): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

function parseDate(raw: string | null): Date | null {
	if (!raw) return null;
	const d = new Date(raw);
	return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
	const { error } = await requireRole("admin", "viewer", "attendant");
	if (error) return error;

	const sp = req.nextUrl.searchParams;
	const limit = parseLimit(sp.get("limit"));
	const offset = parseOffset(sp.get("offset"));
	const channelParam = sp.get("channel");
	const statusParam = sp.get("status");
	const q = sp.get("q")?.trim() ?? "";
	const from = parseDate(sp.get("from"));
	const to = parseDate(sp.get("to"));
	const origemParam = sp.get("origem");
	// Default: oculta conversas simuladas (criadas via /admin/simulator). Debug pode opt-in
	// passando ?include_simulated=true. Aceita só literal "true" — qualquer outra string é false.
	const includeSimulated = sp.get("include_simulated") === "true";
	// O filtro "identificável" (AJA-23 T2, pedido literal do dono em 22/09): só quem
	// tem contato INFORMADO pelo cliente. O predicado vem de `sinais-do-funil`
	// (`conversaIdentificada`) — a mesma função que o funil de mídia e o Percurso
	// usam no degrau "Se identificaram", para as telas não divergirem. Literal
	// "true", como o opt-in de simulado: `=1` não liga por acidente.
	const identificavel = sp.get("identificavel") === "true";

	const channel =
		channelParam && (CHANNELS as readonly string[]).includes(channelParam)
			? (channelParam as (typeof CHANNELS)[number])
			: null;
	const status =
		statusParam && (STATUSES as readonly string[]).includes(statusParam)
			? (statusParam as (typeof STATUSES)[number])
			: null;

	const conditions = [];
	if (!includeSimulated) conditions.push(eq(conversations.isSimulated, false));
	if (identificavel) conditions.push(conversaIdentificada(sql`conversations`));
	if (channel) conditions.push(eq(conversations.channel, channel));
	if (status) conditions.push(eq(conversations.status, status));
	if (q) {
		const pattern = `%${q}%`;
		conditions.push(
			or(ilike(conversations.contactName, pattern), ilike(conversations.waId, pattern)),
		);
	}
	if (from) conditions.push(gte(conversations.updatedAt, from));
	if (to) {
		const endOfDay = new Date(to);
		endOfDay.setHours(23, 59, 59, 999);
		conditions.push(lte(conversations.updatedAt, endOfDay));
	}

	// De onde a conversa veio — é o que faz o número clicado na tela de
	// Performance abrir exatamente aquelas conversas. `desconhecida` é a porta do
	// AJA-17: as conversas sem `visit_id` (WhatsApp orgânico, ou anteriores ao
	// coletor) ficam fora do funil de mídia, e este filtro é o que o link "Ver as
	// 9" da Performance abre. Os demais valores seguem a precedência da tabela
	// por origem — há teste de integração comparando os dois lados.
	if (origemParam === "desconhecida") {
		conditions.push(isNull(conversations.visitId));
	} else {
		const daOrigem = condicaoDeOrigem(origemParam, sp.get("campanha"));
		if (daOrigem) conditions.push(daOrigem);
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const messageCountSubquery = db
		.select({
			conversationId: messages.conversationId,
			count: count().as("message_count"),
		})
		.from(messages)
		.groupBy(messages.conversationId)
		.as("mc");

	// Latest eval por conversa, via DISTINCT ON (mais simples que window function no Drizzle).
	const latestEvalSubquery = db
		.select({
			conversationId: conversationEvaluations.conversationId,
			overallScore: sql<string | null>`${conversationEvaluations.overallScore}`.as(
				"latest_overall_score",
			),
			evaluatedAt: conversationEvaluations.evaluatedAt,
			rowNum:
				sql<number>`row_number() OVER (PARTITION BY ${conversationEvaluations.conversationId} ORDER BY ${conversationEvaluations.evaluatedAt} DESC)`.as(
					"row_num",
				),
		})
		.from(conversationEvaluations)
		.as("le");

	const rowsPromise = db
		.select({
			id: conversations.id,
			contactName: conversations.contactName,
			waId: conversations.waId,
			phone: contacts.phone,
			channel: conversations.channel,
			status: conversations.status,
			isSimulated: conversations.isSimulated,
			contactId: conversations.contactId,
			lastInboundAt: conversations.lastInboundAt,
			metadata: conversations.metadata,
			handedOffUserId: conversations.handedOffUserId,
			handedOffUserName: userTable.name,
			// A coluna Remarketing (AJA-03): o índice é único por conversa, então o
			// LEFT JOIN é 1:1 — uma consulta só, sem N+1.
			reguaStatus: remarketingTouches.status,
			reguaStep: remarketingTouches.step,
			reguaNextTouchAt: remarketingTouches.nextTouchAt,
			reguaUltimoToqueEm: remarketingTouches.ultimoToqueEm,
			reguaMotivoSaida: remarketingTouches.motivoSaida,
			messageCount: sql<number>`COALESCE(${messageCountSubquery.count}, 0)`.as("msg_count"),
			latestEvalScore: latestEvalSubquery.overallScore,
			createdAt: conversations.createdAt,
			updatedAt: conversations.updatedAt,
		})
		.from(conversations)
		.leftJoin(userTable, eq(conversations.handedOffUserId, userTable.id))
		.leftJoin(contacts, eq(contacts.id, conversations.contactId))
		.leftJoin(remarketingTouches, eq(remarketingTouches.conversationId, conversations.id))
		.leftJoin(messageCountSubquery, eq(messageCountSubquery.conversationId, conversations.id))
		.leftJoin(
			latestEvalSubquery,
			and(
				eq(latestEvalSubquery.conversationId, conversations.id),
				eq(latestEvalSubquery.rowNum, 1),
			),
		)
		.where(whereClause)
		.orderBy(desc(conversations.updatedAt))
		.limit(limit)
		.offset(offset);

	const totalPromise = db.select({ value: count() }).from(conversations).where(whereClause);

	const [rows, totalRows] = await Promise.all([rowsPromise, totalPromise]);
	const total = totalRows[0]?.value ?? 0;

	// O motivo e o estado de régua saem da MESMA função que a coluna "Régua" do
	// Percurso usa — duas consultas discordariam na primeira guarda nova.
	const fatos: FatosDaConversa[] = rows.map((r) => ({
		conversationId: r.id,
		channel: r.channel as "web" | "whatsapp",
		status: r.status as "active" | "handed_off" | "closed",
		isSimulated: r.isSimulated,
		contactId: r.contactId ?? null,
		lastInboundAt: r.lastInboundAt ?? null,
		waId: r.waId ?? null,
		telefone: r.phone ?? null,
		regua: r.reguaStatus
			? {
					status: r.reguaStatus as StatusRegua,
					step: Number(r.reguaStep ?? 0),
					nextTouchAt: r.reguaNextTouchAt ?? null,
					ultimoToqueEm: r.reguaUltimoToqueEm ?? null,
				}
			: null,
	}));
	const ehEquipe = await telefonesDaEquipe();
	const avaliacoes = avaliarRegua(fatos, new Date(), ehEquipe);

	const items = rows.map((r) => {
		const meta = (r.metadata ?? {}) as Record<string, unknown>;
		const currentCategory =
			typeof meta.currentCategory === "string" ? (meta.currentCategory as string) : null;
		const avaliacao = avaliacoes.get(r.id);
		return {
			id: r.id,
			contactName: r.contactName,
			waId: r.waId,
			telefoneMascarado: avaliacao?.telefoneMascarado ?? null,
			channel: r.channel,
			status: r.status,
			isSimulated: r.isSimulated,
			ehDaEquipe: avaliacao?.ehDaEquipe ?? false,
			currentCategory,
			handedOffUser: r.handedOffUserId
				? { id: r.handedOffUserId, name: r.handedOffUserName }
				: null,
			messageCount: Number(r.messageCount ?? 0),
			latestEvalScore: r.latestEvalScore !== null ? Number(r.latestEvalScore) : null,
			remarketing: r.reguaStatus
				? {
						status: r.reguaStatus,
						step: Number(r.reguaStep ?? 0),
						nextTouchAt: r.reguaNextTouchAt ?? null,
						ultimoToqueEm: r.reguaUltimoToqueEm ?? null,
						motivoSaida: r.reguaMotivoSaida ?? null,
					}
				: null,
			motivoForaDaRegua: avaliacao?.motivo ?? null,
			createdAt: r.createdAt,
			updatedAt: r.updatedAt,
		};
	});

	return Response.json({ items, total, limit, offset });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O LOTE — o teto de 200 é arbitrado AQUI, não herdado da paginação.
 *
 * A leitura desta rota corta em `MAX_LIMIT = 100` e a tela pagina de 10 em 10,
 * então nenhuma página visível chega perto de 200: o teto é folga para o corpo,
 * e existe para que um array gigante seja RECUSADO (não aplicado pela metade).
 * (`LIMITE_MAXIMO = 200` é de percurso/remarketing, não desta rota.)
 */
const loteSchema = z.object({
	ids: z.array(z.string().regex(UUID_RE)).min(1).max(200),
	isSimulated: z.boolean(),
});

/**
 * `PATCH /api/admin/conversations` — marcar (ou desmarcar) N conversas como
 * teste de uma vez.
 *
 * Vive na rota da COLEÇÃO, e não numa rota `.../lote`: a operação é sobre o
 * conjunto que o `GET` ao lado devolve, com o mesmo filtro na mão — o dono
 * marca na lista o que ele acabou de ver. Uma rota própria criaria o segundo
 * caminho para a mesma linha, e o `[id]` já é o primeiro.
 *
 * Só `admin` (o individual também é): marcar teste tira do funil, das métricas
 * e da régua, e uma sessão de atendente não tem por que mexer nisso.
 */
export async function PATCH(req: Request) {
	const { error } = await requireRole("admin");
	if (error) return error;

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return Response.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = loteSchema.safeParse(body);
	if (!parsed.success) {
		return Response.json(
			{ error: "Corpo inválido", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const resultado = await marcarConversasComoTeste(parsed.data.ids, parsed.data.isSimulated);

	return Response.json({
		isSimulated: parsed.data.isSimulated,
		conversas: resultado.conversas,
		leadsMarcados: resultado.leads,
		toquesSegurados: resultado.toquesSegurados,
	});
}
