/**
 * A LIMPEZA DA BASE — a parte que toca o banco.
 *
 * Separado de `./limpeza.ts` de propósito: aquele é puro (o Pipeline filtra no
 * cliente e não pode arrastar `@/db` para o bundle do navegador); este fala com
 * as tabelas.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { conversations, leads, remarketingTouches, visits } from "@/db/schema";
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
 * não vive em coluna nenhuma. Traz os QUATRO sinais que EXISTEM — já marcada
 * como teste, telefone da equipe, "na mesa sem contato" e "na mesa sem origem de
 * campanha" — e deixa a decisão aberta.
 *
 * **Por que "na mesa sem contato" exige a mesa.** Web sem contato é ruído em
 * massa (a maioria dos abandonos da landing não deixa telefone). O que o dono
 * descreveu — *"foi só pela web e eu não tenho contato dele… esses aí também
 * eles já não entram nessa seara nossa aqui de recontactar"* — é o caso que
 * CHEGOU a alguém e não tem como ser retomado. Por isso o sinal exige
 * `handed_off_user_id`, e nasce do cruzamento com a mesa.
 *
 * **Por que "na mesa sem origem de campanha" também existe.** É o recorte que o
 * PRD (AJA-23 T1(c)) pede para achar o caso que nenhum outro sinal pega: gente
 * REAL (não simulada), COM contato, que caiu na mesa e nenhuma campanha
 * explica. Sem ele, um lead assim não casa em motivo nenhum e some do relatório.
 *
 * **Uma linha por conversa, garantida em memória e não no SQL.** `leads` não tem
 * índice único em `conversation_id` (o próprio código trata N leads por
 * conversa), então o `LEFT JOIN` devolve N linhas para a mesma conversa. O
 * agrupamento aqui dobra os fatos ("algum lead tem telefone?") antes de calcular
 * o motivo — contar LINHA faria o cartão da tela e o CSV contarem a mesma
 * conversa duas vezes, contra o contrato do recorte ("uma linha por conversa").
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
			// A origem da campanha vive na VISITA da conversa: o id da campanha da
			// Meta, a UTM ou o id do anúncio CTWA. Qualquer um dos três explica a
			// chegada — e nenhum deles é "sem origem".
			campaignId: visits.campaignId,
			utmCampaign: visits.utmCampaign,
			ctwaSourceId: visits.ctwaSourceId,
		})
		.from(conversations)
		.leftJoin(leads, eq(leads.conversationId, conversations.id))
		.leftJoin(visits, eq(visits.id, conversations.visitId))
		.where(and(gte(conversations.createdAt, opcoes.de), lte(conversations.createdAt, opcoes.ate)));

	/**
	 * O `""` do banco é AUSÊNCIA, não valor — e o SQL desta casa não distingue os
	 * dois. Sem normalizar aqui, um `contact_name` em branco venceria o `??` da
	 * cadeia de contato e a linha sairia com célula vazia; a exportação lança em
	 * célula vazia (`conferirSemVazio`), então o CSV inteiro deixaria de baixar
	 * enquanto o cartão da tela continuava contando as linhas.
	 */
	function texto(valor: string | null): string | null {
		if (valor === null) return null;
		const t = valor.trim();
		return t ? t : null;
	}

	const ehEquipe = await telefonesDaEquipe();

	// O dobramento por conversa: uma linha por `id`, com os fatos somados.
	interface Acumulado {
		contactName: string | null;
		waId: string | null;
		channel: string;
		isSimulated: boolean;
		contactId: string | null;
		handedOffUserId: string | null;
		updatedAt: Date;
		nomeDoLead: string | null;
		telefoneDoLead: string | null;
		temContatoNoLead: boolean;
		temOrigemDeCampanha: boolean;
	}

	const porConversa = new Map<string, Acumulado>();
	for (const linha of linhas) {
		const temOrigem =
			linha.campaignId !== null || linha.utmCampaign !== null || linha.ctwaSourceId !== null;
		const atual = porConversa.get(linha.id);
		// `""` vira `null` antes de qualquer decisão — ver `texto`.
		const contactName = texto(linha.contactName);
		const waId = texto(linha.waId);
		const nomeDoLead = texto(linha.leadName);
		const telefoneDoLead = texto(linha.leadPhone);
		const temContatoNoLead = telefoneDoLead !== null || texto(linha.leadEmail) !== null;
		if (!atual) {
			porConversa.set(linha.id, {
				contactName,
				waId,
				channel: linha.channel,
				isSimulated: linha.isSimulated,
				contactId: linha.contactId,
				handedOffUserId: linha.handedOffUserId,
				updatedAt: linha.updatedAt,
				nomeDoLead,
				telefoneDoLead,
				temContatoNoLead,
				temOrigemDeCampanha: temOrigem,
			});
			continue;
		}
		// N leads por conversa: qualquer lead serve, e qualquer origem explica.
		atual.nomeDoLead ??= nomeDoLead;
		atual.telefoneDoLead ??= telefoneDoLead;
		atual.temContatoNoLead = atual.temContatoNoLead || temContatoNoLead;
		atual.temOrigemDeCampanha = atual.temOrigemDeCampanha || temOrigem;
	}

	const candidatos: CandidatoDeLimpeza[] = [];
	for (const [id, linha] of porConversa) {
		const telefone = linha.telefoneDoLead ?? linha.waId ?? null;
		const semContato =
			linha.handedOffUserId !== null && linha.contactId === null && !linha.temContatoNoLead;
		const semOrigemDeCampanha = linha.handedOffUserId !== null && !linha.temOrigemDeCampanha;

		const motivo = motivoDeLimpeza({
			jaMarcadaComoTeste: linha.isSimulated,
			telefoneDaEquipe: telefone !== null && ehEquipe(telefone),
			naMesaSemContato: semContato,
			naMesaSemOrigemDeCampanha: semOrigemDeCampanha,
		});

		if (motivo === null) continue;

		const contato =
			linha.contactName ?? linha.nomeDoLead ?? linha.telefoneDoLead ?? linha.waId ?? "sem contato";

		candidatos.push({
			conversationId: id,
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
