// FIX-46 — retomada de contexto no MESMO dispositivo.
// Acha "a conversa deste cookie" (web, ativa, não handed-off) pra reidratar o
// chat exatamente onde o usuário parou. O cookie `aja_uid` (HttpOnly, 90d) já
// prova posse do device — não exige verificação (same-device é seguro).
//
// Regra de ouro (F2): cookie ausente OU sem conversa anterior → null → fluxo de
// PRIMEIRA VEZ idêntico ao de hoje. Zero atrito.

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import type { GatePartData } from "@/lib/chat/ui-message";
import { ehMarcadorDeCard } from "@/lib/conversation/messages";

/**
 * Uma parte da mensagem, na ordem em que ela foi para a tela.
 *
 * O card NÃO é um apêndice da fala: no meio do turno o cliente vê
 * texto → card → texto, e a retomada tem de devolver isso na mesma ordem — senão
 * o card reaparece no fim da conversa toda vez que a página é recarregada.
 */
export type ResumablePart =
	| { type: "text"; text: string }
	| { type: "artifact"; artifactType: string; payload: unknown };

export interface ResumableMessage {
	id: string;
	role: "user" | "assistant";
	/** As partes na ordem persistida (ver `buildResumableMessages`). */
	parts: ResumablePart[];
}

/** Linha de `messages` (com os artifacts ligados a ela) como a retomada a lê. */
export interface ResumeRow {
	id: string;
	role: string;
	content: string;
	artifacts: Array<{ type: string; payload: unknown }>;
}

/**
 * As partes de UMA linha persistida.
 *
 * Marcador de card (`[card: tipo]`) nunca é fala: o texto dele é o próprio card
 * (regra de `ehMarcadorDeCard`), então a linha vira só a parte do artifact.
 * Fala de verdade vem primeiro, e os artifacts da linha depois — é a ordem do
 * próprio schema: o artifact nasce ligado à mensagem que o acompanha.
 */
function partesDaLinha(row: ResumeRow): ResumablePart[] {
	const partes: ResumablePart[] = [];
	if (row.content.length > 0 && !ehMarcadorDeCard(row.role, row.content)) {
		partes.push({ type: "text", text: row.content });
	}
	for (const artifact of row.artifacts) {
		partes.push({ type: "artifact", artifactType: artifact.type, payload: artifact.payload });
	}
	return partes;
}

/**
 * As linhas persistidas → as mensagens que a tela reidrata.
 *
 * Um TURNO do assistente é uma mensagem só: as linhas que ele gravou (um balão
 * por trecho de fala, uma linha marcadora por card) são costuradas na ordem de
 * criação — a ordem em que foram para a tela — dentro de `parts`. Solto, cada
 * linha virava uma bolha própria com avatar repetido, e o card ficava
 * deslocado; agrupado, a retomada reconstrói a mesma cena do ao vivo.
 *
 * Pura (testável sem banco): quem lê o banco é `getResumableConversation`.
 */
export function buildResumableMessages(rows: readonly ResumeRow[]): ResumableMessage[] {
	const mensagens: ResumableMessage[] = [];
	for (const row of rows) {
		if (row.role !== "user" && row.role !== "assistant") continue;
		const partes = partesDaLinha(row);
		if (partes.length === 0) continue;

		const anterior = mensagens[mensagens.length - 1];
		if (row.role === "assistant" && anterior?.role === "assistant") {
			anterior.parts.push(...partes);
			continue;
		}
		mensagens.push({ id: row.id, role: row.role, parts: partes });
	}
	return mensagens;
}

export interface ResumableConversation {
	conversationId: string;
	messages: ResumableMessage[];
	/** FIX-51: metadados leves pro popup decidir/rotular (sem vazar dado sensível). */
	messageCount: number;
	/** Card do gate que o funil aguarda AGORA (derivado do estado, não do
	 * histórico) — sem isto a retomada volta muda, sem componente de input. */
	gate: GatePartData | null;
	lastActivityAt: string;
	/** Server-derived: a conversa tem progresso real (acima do limiar)? Decide se
	 * o popup "voltar/nova" aparece — abaixo do limiar hidrata direto (zero ruído). */
	meaningfulProgress: boolean;
}

/** FIX-51 — limiar de mensagens pro popup de retomada (≈2 trocas reais). Abaixo
 * disso, sem sinal de raia, a conversa é "1 fala" → hidrata sem perguntar. */
export const RESUME_MIN_MESSAGES = 4;

/** FIX-51 — a conversa tem progresso significativo pra justificar o popup? Pura
 * (testável sem DB). ADR Decisão 1: contagem de mensagens OU sinal de raia
 * (passou da qualificação / reveal / fechamento). */
export function hasMeaningfulProgress(
	messageCount: number,
	meta:
		| { revealCompleted?: boolean; maxStageReached?: string; contractClosed?: boolean }
		| null
		| undefined,
): boolean {
	if (messageCount >= RESUME_MIN_MESSAGES) return true;
	if (!meta) return false;
	if (meta.revealCompleted === true) return true;
	if (meta.contractClosed === true) return true;
	if (meta.maxStageReached === "qualificado") return true;
	return false;
}

/**
 * Última conversa web ativa vinculada ao cookie. `null` quando não há cookie
 * ou nenhuma conversa retomável (primeira vez). Sem cache (caller marca no-store).
 */
export async function getResumableConversation(
	cookieValue: string | null | undefined,
): Promise<ResumableConversation | null> {
	if (!cookieValue) return null;

	const conv = await db.query.conversations.findFirst({
		where: and(
			eq(conversations.channel, "web"),
			ne(conversations.status, "handed_off"),
			sql`${conversations.metadata} ->> 'webCookie' = ${cookieValue}`,
		),
		orderBy: [desc(conversations.updatedAt)],
		with: {
			messages: {
				// Ordem de CRIAÇÃO: `created_at` e, no empate de milissegundo (turno
				// inteiro gravado na mesma volta do relógio), o id — a leitura precisa
				// ser determinística, porque é ela que dá a posição do card.
				orderBy: (m, { asc }) => [asc(m.createdAt), asc(m.id)],
				// Os CARDS precisam voltar junto. Sem isto, ao dar refresh/voltar, o
				// que reaparecia era a linha marcadora crua ("[card: contemplation_dial]")
				// como se fosse fala do agente, e o componente sumia da tela.
				with: { artifacts: { orderBy: (a, { asc }) => [asc(a.createdAt), asc(a.id)] } },
			},
		},
	});

	if (!conv) return null;

	// As partes voltam na ordem persistida — texto → card → texto, quando foi
	// assim. Marcador de card não vira texto; sem artifact não há o que mostrar.
	const linhas = conv.messages.filter((m) => m.role !== "system" && m.content.length > 0);
	const visiveis = buildResumableMessages(
		linhas.map((m) => ({
			id: m.id,
			role: m.role as string,
			content: m.content,
			artifacts: (m.artifacts ?? []).map((a) => ({ type: a.type as string, payload: a.payload })),
		})),
	);

	// Conversa existe mas sem mensagens úteis → trata como primeira vez (nada a
	// reidratar), evita "ressuscitar" uma conversa vazia.
	if (visiveis.length === 0) return null;

	// FIX-51: metadados leves pro popup decidir (limiar) e rotular (recência).
	const meta = (conv.metadata ?? {}) as {
		revealCompleted?: boolean;
		maxStageReached?: string;
		contractClosed?: boolean;
	};
	// Sem gate não há card de input a remontar: quem conduz é o vendedor, e o
	// que existe na tela são os artifacts de verdade (comparativo, proposta),
	// que voltam pelo histórico.
	return {
		conversationId: conv.id,
		messages: visiveis,
		gate: null,
		messageCount: visiveis.length,
		lastActivityAt: (conv.updatedAt ?? conv.createdAt ?? new Date()).toISOString(),
		meaningfulProgress: hasMeaningfulProgress(linhas.length, meta),
	};
}
