/**
 * FIX-394/395/396/397 — o lado SERVIDOR do teste do telefone: quem é a variante
 * desta conversa, se a comparação já pode ser liberada, e como registrar o
 * desfecho (telefone informado / "Agora não").
 *
 * Existe para o `pipeOrchestratorToWriter` e a rota do chat fazerem a MESMA
 * pergunta do cliente (`estadoDoDesbloqueio`) sem reimplementar a leitura do
 * metadata nem a régua de "telefone conhecido".
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
	artifacts as artifactsTable,
	conversations,
	leads,
	messages as messagesTable,
} from "@/db/schema";
import { loadIdentity } from "@/lib/conversation/identity";
import { type EstadoDoDesbloqueio, estadoDoDesbloqueio } from "./desbloqueio-do-telefone";
import { CHAVE_DO_TESTE_NO_METADATA } from "./resultado-do-teste-do-telefone";
import {
	ehVarianteDoTelefone,
	type VarianteDoTelefone,
	varianteDaConversa,
} from "./variante-da-visita";

interface EstadoPersistido {
	variante?: unknown;
	recusado?: unknown;
	desbloqueadoEm?: unknown;
	/** `true` quando o braço foi FORÇADO por `?variante=` (QA/dono) — a conversa
	 *  está fora do teste e conta como "sem variante" para quem mede. */
	forcada?: unknown;
}

function lerEstadoPersistido(metadata: unknown): EstadoPersistido {
	const teste = (metadata as Record<string, unknown> | null)?.[CHAVE_DO_TESTE_NO_METADATA];
	return (teste ?? {}) as EstadoPersistido;
}

/**
 * A variante DESTA conversa para quem MEDE o teste.
 *
 * Prefere o que está persistido; se ainda não foi gravado (conversa anterior a
 * este bloco, ou criação fora da rota), deriva do visitId — a mesma função pura
 * que grava. Nunca devolve uma variante inventada.
 *
 * Conversa `forcada` (`?variante=`) devolve `null`: "sem variante". Forçar é QA —
 * a conversa não entrou na fila e não é resultado de A/B. A UI do chat continua
 * vendo o braço forçado em `leituraDoDesbloqueio` (o dono precisa validar a ponta
 * que pediu); o que sai da conta é a LEITURA.
 */
export async function varianteDaConversaPersistida(
	conversationId: string,
): Promise<VarianteDoTelefone | null> {
	const conversa = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { visitId: true, metadata: true },
	});
	if (!conversa) return null;
	const persistido = lerEstadoPersistido(conversa.metadata);
	if (persistido.forcada === true) return null;
	if (ehVarianteDoTelefone(persistido.variante)) return persistido.variante;
	return varianteDaConversa({ visitId: conversa.visitId, conversationId });
}

/** O telefone desta conversa já é conhecido? (lead ou identidade cifrada) */
export async function celularConhecidoDaConversa(conversationId: string): Promise<boolean> {
	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
		columns: { phone: true, email: true },
	});
	if (lead?.phone) return true;
	const identidade = await loadIdentity(conversationId).catch(() => null);
	return Boolean(identidade?.celular);
}

export interface LeituraDoDesbloqueio {
	variante: VarianteDoTelefone;
	estado: EstadoDoDesbloqueio;
}

/**
 * O estado do desbloqueio desta conversa. `null` só quando a conversa não
 * existe — nunca um estado inventado.
 */
export async function leituraDoDesbloqueio(
	conversationId: string,
): Promise<LeituraDoDesbloqueio | null> {
	const conversa = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { visitId: true, metadata: true },
	});
	if (!conversa) return null;

	const persistido = lerEstadoPersistido(conversa.metadata);
	const variante = ehVarianteDoTelefone(persistido.variante)
		? persistido.variante
		: varianteDaConversa({ visitId: conversa.visitId, conversationId });

	const [celularConhecido] = await Promise.all([celularConhecidoDaConversa(conversationId)]);

	return {
		variante,
		estado: estadoDoDesbloqueio({
			variante,
			celularConhecido,
			recusado: persistido.recusado === true,
		}),
	};
}

/**
 * A COMPARAÇÃO que já foi produzida para esta conversa, guardada nos artifacts.
 *
 * É a peça que permite a variante B ser um passo de verdade: a descoberta roda
 * uma vez e os cards ficam gravados (`registrarCardEnviado`); quando o telefone
 * chega, o servidor RE-EMITE esses mesmos cards — sem re-buscar na Bevi e sem
 * inventar número novo. Devolve o `comparison_table` e o `recommendation_card`
 * mais recentes (a âncora do reveal).
 *
 * Vazio ⇒ não há o que liberar (a busca nunca rodou, ou foi degradada): quem
 * chama trata como "não há comparação guardada" em vez de emitir nada.
 */
export async function comparacaoGuardadaDaConversa(
	conversationId: string,
): Promise<
	Array<{ type: "comparison_table" | "recommendation_card"; payload: Record<string, unknown> }>
> {
	const linhas = await db
		.select({ type: artifactsTable.type, payload: artifactsTable.payload })
		.from(artifactsTable)
		.innerJoin(messagesTable, eq(artifactsTable.messageId, messagesTable.id))
		.where(
			and(
				eq(messagesTable.conversationId, conversationId),
				inArray(artifactsTable.type, ["comparison_table", "recommendation_card"]),
			),
		)
		.orderBy(desc(artifactsTable.createdAt));

	const primeiraDe = (tipo: string) => linhas.find((l) => l.type === tipo);
	const saida: Array<{
		type: "comparison_table" | "recommendation_card";
		payload: Record<string, unknown>;
	}> = [];
	const tabela = primeiraDe("comparison_table");
	const hero = primeiraDe("recommendation_card");
	// A tabela primeiro: é ela que traz TODAS as cotas do reveal; o hero re-ancora
	// a recomendada (mesma ordem em que a descoberta emite).
	if (tabela) saida.push({ type: "comparison_table", payload: tabela.payload });
	if (hero) saida.push({ type: "recommendation_card", payload: hero.payload });
	return saida;
}

/** Grava o desfecho (telefone informado / "Agora não") no metadata da conversa,
 *  SEM tocar em `webCookie` nem em qualquer outro campo que já esteja lá.
 *
 *  O braço só entra se JÁ estiver persistido como fato (allowlist `A`/`B`). Sem
 *  ele — ou com valor fora da allowlist — a conversa recebe o desfecho e
 *  **nenhum** `variante`: derivar por hash gravaria como fato um chute, e quem
 *  lê o metadata é o filtro do painel e a coluna da exportação. */
export async function registrarDesfechoDoTeste(
	conversationId: string,
	patch: { desbloqueadoEm?: string; recusado?: boolean },
): Promise<void> {
	const conversa = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
		columns: { metadata: true },
	});
	if (!conversa) return;
	const metadata = (conversa.metadata ?? {}) as Record<string, unknown>;
	const { variante: persistida, ...resto } = lerEstadoPersistido(conversa.metadata);
	const teste: Record<string, unknown> = { ...resto, ...patch };
	if (ehVarianteDoTelefone(persistida)) teste.variante = persistida;

	await db
		.update(conversations)
		.set({
			metadata: {
				...metadata,
				[CHAVE_DO_TESTE_NO_METADATA]: teste,
			},
		})
		.where(eq(conversations.id, conversationId));
}
