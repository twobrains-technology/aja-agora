/**
 * A LIMPEZA DA BASE — a parte que toca o banco.
 *
 * Separado de `./limpeza.ts` de propósito: aquele é puro (o Pipeline filtra no
 * cliente e não pode arrastar `@/db` para o bundle do navegador); este fala com
 * as tabelas.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads, remarketingTouches } from "@/db/schema";
import { MOTIVO_SAIDA_TESTE } from "@/lib/remarketing/motivo-de-exclusao";
import { motivoDeLimpeza } from "./limpeza";
import { telefonesDaEquipe } from "./regua-por-conversa";

/** Quantas linhas cada tabela perdeu do funil nesta marcação. */
export interface ResultadoDaMarcacao {
	conversas: number;
	leads: number;
	/** Linhas da régua seguradas (0 ao desmarcar, ou quando não havia linha ativa). */
	toquesSegurados: number;
}

/**
 * Marca (ou desmarca) N conversas como TESTE — a operação que o PATCH de uma
 * conversa já fazia, agora em lote.
 *
 * **Por que as três tabelas de uma vez.** É a mesma razão documentada no PATCH
 * de `[id]`: as consultas do painel filtram conversa e lead de forma
 * independente, então marcar só a conversa tira o topo do funil e deixa o meio
 * contando. E a régua precisa sair junto: a entrada filtrava `is_simulated`, a
 * consulta que decide QUEM dispara não — em produção isso apareceu como "desses
 * seis toques, três já somos nós" (Bruna, 18/09 11:56).
 *
 * **Reversível, como o individual.** Desmarcar volta conversa e leads; as
 * linhas da régua seguradas FICAM seguradas — reabrir no unmark religaria toque
 * automático para uma conversa classificada ao acaso.
 *
 * Lista vazia é no-op, e não um `IN ()` que casaria tudo.
 */
export async function marcarConversasComoTeste(
	ids: string[],
	isSimulated: boolean,
): Promise<ResultadoDaMarcacao> {
	if (ids.length === 0) return { conversas: 0, leads: 0, toquesSegurados: 0 };

	const atualizadas = await db
		.update(conversations)
		.set({ isSimulated, updatedAt: new Date() })
		.where(inArray(conversations.id, ids))
		.returning({ id: conversations.id });

	if (isSimulated) {
		const marcados = await db
			.update(leads)
			.set({ isSimulated })
			.where(inArray(leads.conversationId, ids))
			.returning({ id: leads.id });

		// Só a linha ATIVA: linha terminal não é reescrita — a marcação não pode
		// apagar "o cliente respondeu" nem "pediu para sair" com motivo de teste.
		const segurados = await db
			.update(remarketingTouches)
			.set({ status: "RESPONDEU", motivoSaida: MOTIVO_SAIDA_TESTE })
			.where(
				and(
					inArray(remarketingTouches.conversationId, ids),
					eq(remarketingTouches.status, "ATIVO"),
				),
			)
			.returning({ id: remarketingTouches.id });

		return {
			conversas: atualizadas.length,
			leads: marcados.length,
			toquesSegurados: segurados.length,
		};
	}

	const desmarcados = await db
		.update(leads)
		.set({ isSimulated })
		.where(inArray(leads.conversationId, ids))
		.returning({ id: leads.id });

	return {
		conversas: atualizadas.length,
		leads: desmarcados.length,
		toquesSegurados: 0,
	};
}

/** Uma linha do relatório de candidatos — o que o dono olha para decidir. */
export interface CandidatoDeLimpeza {
	conversationId: string;
	/** Nome do contato, ou o telefone/waId, ou "sem contato" — nunca vazio. */
	contato: string;
	motivo: ReturnType<typeof motivoDeLimpeza>;
	canal: string;
	ultimaAtividade: string;
	/** `true` quando a conversa JÁ está fora do funil — o `[x]` da planilha. */
	jaMarcada: boolean;
}

/**
 * OS CANDIDATOS — quem tem sinal objetivo de não ser cliente real.
 *
 * Não tenta achar "cliente oculto" (conhecido da Bruna que caiu na mesa): isso
 * não vive em coluna nenhuma. Traz os três sinais que EXISTEM — já marcada como
 * teste, telefone da equipe e "na mesa sem contato" — e deixa a decisão aberta.
 *
 * **Por que "na mesa sem contato" exige a mesa.** Web sem contato é ruído em
 * massa (a maioria dos abandonos da landing não deixa telefone). O que o dono
 * descreveu — *"foi só pela web e eu não tenho contato dele… esses aí também
 * eles já não entram nessa seara nossa aqui de recontactar"* — é o caso que
 * CHEGOU a alguém e não tem como ser retomado. Por isso o sinal exige
 * `handed_off_user_id`, e nasce do cruzamento com a mesa.
 */
export async function listarCandidatosDeLimpeza(opcoes: {
	de: Date;
	ate: Date;
}): Promise<CandidatoDeLimpeza[]> {
	const linhas = await db
		.select({
			id: conversations.id,
			contactName: conversations.contactName,
			waId: conversations.waId,
			channel: conversations.channel,
			isSimulated: conversations.isSimulated,
			contactId: conversations.contactId,
			handedOffUserId: conversations.handedOffUserId,
			updatedAt: conversations.updatedAt,
			leadName: leads.name,
			leadPhone: leads.phone,
			leadEmail: leads.email,
		})
		.from(conversations)
		.leftJoin(leads, eq(leads.conversationId, conversations.id))
		.where(and(gte(conversations.createdAt, opcoes.de), lte(conversations.createdAt, opcoes.ate)));

	const ehEquipe = await telefonesDaEquipe();

	const candidatos: CandidatoDeLimpeza[] = [];
	for (const linha of linhas) {
		const telefone = linha.leadPhone ?? linha.waId ?? null;
		const semContato =
			linha.handedOffUserId !== null &&
			linha.contactId === null &&
			linha.leadPhone === null &&
			linha.leadEmail === null;

		const motivo = motivoDeLimpeza({
			jaMarcadaComoTeste: linha.isSimulated,
			telefoneDaEquipe: telefone !== null && ehEquipe(telefone),
			naMesaSemContato: semContato,
		});

		if (motivo === null) continue;

		const contato =
			linha.contactName ?? linha.leadName ?? linha.leadPhone ?? linha.waId ?? "sem contato";

		candidatos.push({
			conversationId: linha.id,
			contato,
			motivo,
			canal: linha.channel,
			ultimaAtividade: linha.updatedAt.toISOString(),
			jaMarcada: linha.isSimulated,
		});
	}

	// Mais recente primeiro: é a lista de quem a Bruna acabou de ver na tela.
	return candidatos.sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade));
}
