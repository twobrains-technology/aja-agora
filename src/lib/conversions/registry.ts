// Fonte única dos fatos de conversão V2. Endpoints e workers registram fatos;
// só este módulo conhece a fila/atribuição da Meta.
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, conversations, conversionEvents, leads, visits } from "@/db/schema";
import { type LeadStage, STAGE_ORDER } from "@/lib/admin/lead-stages";
import { contentIdDoEvento, numeroOuNulo } from "./conteudo-do-evento";
import { hashEmail, hashExternalId, hashPhone, montarFbc } from "./hash";

export type ConversionEventName =
	| "conversation_started"
	| "lead"
	| "qualified_lead"
	| "offer_viewed"
	| "proposal_sent"
	| "purchase";

/** Nomes do contrato anterior. Continuam sendo gravados enquanto a flag do V2
 * estiver desligada — não são reinterpretados nem traduzidos para os novos. */
export type LegacyConversionEventName = "lead_qualificado" | "proposta_criada" | "contrato_fechado";

type QualquerEvento = ConversionEventName | LegacyConversionEventName;

const ESTAGIO_PARA_EVENTO: Partial<Record<LeadStage, ConversionEventName>> = {
	qualificado: "qualified_lead",
};

const ESTAGIO_PARA_EVENTO_LEGADO: Partial<Record<LeadStage, LegacyConversionEventName>> = {
	qualificado: "lead_qualificado",
	proposta_enviada: "proposta_criada",
	fechado_ganho: "contrato_fechado",
};

export function contratoV2Ativo(): boolean {
	return process.env.META_CONVERSION_CONTRACT_V2_ENABLED === "true";
}

/**
 * Qual evento este estágio gera — no contrato que estiver vigente.
 *
 * A flag governa QUAL contrato responde, nunca SE alguém responde. Desligada,
 * o funil continua medindo como media antes; ligada, passa a medir pelo V2.
 * Um rollout em que a posição "desligada" apaga a medição atual não é rollout.
 */
export function eventoDoEstagio(stage: LeadStage): QualquerEvento | null {
	if (!contratoV2Ativo()) return ESTAGIO_PARA_EVENTO_LEGADO[stage] ?? null;
	return ESTAGIO_PARA_EVENTO[stage] ?? null;
}

function chave(input: {
	eventName: ConversionEventName;
	leadId?: string | null;
	conversationId?: string | null;
	entityId?: string | null;
}): string | null {
	if (input.eventName === "conversation_started")
		return input.conversationId
			? `conversation:${input.conversationId}:conversation_started`
			: null;
	if (input.eventName === "lead" || input.eventName === "qualified_lead")
		return input.leadId ? `lead:${input.leadId}:${input.eventName}` : null;
	if (input.eventName === "offer_viewed")
		return input.leadId && input.entityId
			? `lead:${input.leadId}:offer_viewed:${input.entityId}`
			: null;
	if (input.eventName === "proposal_sent")
		return input.leadId && input.entityId
			? `lead:${input.leadId}:proposal_sent:${input.entityId}`
			: null;
	if (input.eventName === "purchase")
		return input.leadId && input.entityId
			? `lead:${input.leadId}:purchase:${input.entityId}`
			: null;
	return null;
}

/**
 * Monta e grava o fato. O contrato decide só duas coisas — o nome do evento e
 * a chave de idempotência. Origem, valor, hashes e atribuição são idênticos
 * nos dois: o que muda é a semântica do marco, não o dado por trás dele.
 */
async function gravarFato(input: {
	eventName: QualquerEvento;
	montarChave: (ctx: { leadId: string | null; conversationId: string | null }) => string | null;
	leadId?: string | null;
	conversationId?: string | null;
	entityId?: string | null;
	saleId?: string | null;
	occurredAt?: Date;
	previousStage?: string | null;
	currentStage?: string | null;
}): Promise<void> {
	try {
		const lead = input.leadId
			? await db.query.leads.findFirst({ where: eq(leads.id, input.leadId) })
			: null;
		if (lead?.isSimulated) return;
		const conversationId = input.conversationId ?? lead?.conversationId ?? null;
		const conversa = conversationId
			? await db.query.conversations.findFirst({ where: eq(conversations.id, conversationId) })
			: null;
		if (conversa?.isSimulated) return;
		const eventKey = input.montarChave({
			leadId: lead?.id ?? input.leadId ?? null,
			conversationId,
		});
		if (!eventKey) return;

		// Lead exige conversa e contato válido; nome, CPF ou intenção não bastam.
		if (
			input.eventName === "lead" &&
			(!conversa || (!hashEmail(lead?.email) && !hashPhone(lead?.phone)))
		)
			return;
		const visita = conversa?.visitId
			? await db.query.visits.findFirst({ where: eq(visits.id, conversa.visitId) })
			: null;
		const primeiraVisita = visita
			? await db.query.visits.findFirst({
					where: eq(visits.visitorId, visita.visitorId),
					orderBy: [asc(visits.createdAt)],
				})
			: null;
		const proposta = input.entityId
			? await db.query.beviProposals.findFirst({
					where: eq(beviProposals.proposalId, input.entityId),
				})
			: lead
				? await db.query.beviProposals.findFirst({
						where: eq(beviProposals.leadId, lead.id),
						orderBy: (t, { desc }) => [desc(t.createdAt)],
					})
				: null;
		const valor = numeroOuNulo(proposta?.creditValue) ?? numeroOuNulo(lead?.creditValue);
		const contentId = contentIdDoEvento({
			segmentoBevi: proposta?.segmento,
			creditoDaProposta: numeroOuNulo(proposta?.creditValue),
			creditoDoLead: numeroOuNulo(lead?.creditValue),
			landingPath: visita?.landingPath,
			utmCampaign: visita?.utmCampaign,
		});

		await db
			.insert(conversionEvents)
			.values({
				leadId: lead?.id ?? null,
				conversationId,
				visitId: visita?.id ?? null,
				eventName: input.eventName,
				destination: "meta",
				eventKey,
				occurredAt: input.occurredAt ?? new Date(),
				value: valor === null ? null : valor.toFixed(2),
				currency: "BRL",
				hashedEmail: hashEmail(lead?.email),
				hashedPhone: hashPhone(lead?.phone ?? conversa?.waId),
				externalId: hashExternalId(lead?.id),
				fbc: montarFbc(visita?.fbclid, visita?.createdAt.getTime() ?? Date.now()),
				fbp: visita?.fbp ?? null,
				ctwaClid: visita?.ctwaClid ?? null,
				clientUserAgent: visita?.userAgent ?? null,
				firstVisitId: primeiraVisita?.id ?? null,
				lastVisitId: visita?.id ?? null,
				campaignId: visita?.campaignId ?? null,
				adsetId: visita?.adsetId ?? null,
				adId: visita?.adId ?? visita?.ctwaSourceId ?? null,
				previousStage: input.previousStage ?? null,
				currentStage: input.currentStage ?? lead?.stage ?? null,
				proposalId:
					proposta?.proposalId ??
					(input.eventName === "proposal_sent" ? (input.entityId ?? null) : null),
				saleId: input.saleId ?? null,
				contentId,
				actionSource:
					conversa?.channel === "whatsapp" || visita?.ctwaClid ? "business_messaging" : "website",
			})
			.onConflictDoNothing();
	} catch (error) {
		console.error("[conversions] falha ao registrar fato de conversão:", error);
	}
}

export async function registrarEventoDeConversao(input: {
	eventName: ConversionEventName;
	leadId?: string | null;
	conversationId?: string | null;
	entityId?: string | null;
	saleId?: string | null;
	occurredAt?: Date;
	previousStage?: string | null;
	currentStage?: string | null;
}): Promise<void> {
	if (!contratoV2Ativo()) return;
	await gravarFato({
		...input,
		montarChave: (ctx) => chave({ ...input, ...ctx }),
	});
}

export async function registrarInicioDeConversaReal(
	conversationId: string,
	occurredAt?: Date,
): Promise<void> {
	await registrarEventoDeConversao({
		eventName: "conversation_started",
		conversationId,
		occurredAt,
	});
}

export async function registrarLeadIdentificado(
	conversationId: string,
	occurredAt?: Date,
): Promise<void> {
	const lead = await db.query.leads.findFirst({ where: eq(leads.conversationId, conversationId) });
	if (lead)
		await registrarEventoDeConversao({
			eventName: "lead",
			leadId: lead.id,
			conversationId,
			occurredAt,
		});
}

/** Oferta/proposta só vira sinal depois de a camada de canal confirmar entrega. */
export async function registrarOfertaExibida(
	leadId: string,
	offerOrProposalId: string,
): Promise<void> {
	await registrarEventoDeConversao({
		eventName: "offer_viewed",
		leadId,
		entityId: offerOrProposalId,
	});
}

export async function registrarPropostaEnviada(leadId: string, proposalId: string): Promise<void> {
	await registrarEventoDeConversao({ eventName: "proposal_sent", leadId, entityId: proposalId });
}

/** Só o reconciliador financeiro deve chamar este marco terminal. */
export async function registrarCompraConfirmada(
	leadId: string,
	saleOrProposalId: string,
	saleId?: string | null,
): Promise<void> {
	await registrarEventoDeConversao({
		eventName: "purchase",
		leadId,
		entityId: saleOrProposalId,
		saleId,
	});
}

/**
 * Os estágios que esta transição ATRAVESSOU, incluindo o destino.
 *
 * Um lead salta: `applyTrackedStageToLead` aplica de uma vez o estágio máximo
 * alcançado na conversa, então quem informou CPF (qualificou) e seguiu até ver
 * os grupos reais entra direto em `em_negociacao`, sem nunca pisar em
 * `qualificado`. Marcar só o destino perderia justamente o `QualifiedLead` —
 * o sinal que a mídia usa para otimizar, de um lead que qualificou de verdade.
 *
 * Sem estágio anterior conhecido só o destino conta: inventar caminho para trás
 * criaria marco que ninguém percorreu.
 */
function estagiosAtravessados(stage: LeadStage, previousStage?: LeadStage): LeadStage[] {
	if (!previousStage) return [stage];
	const de = STAGE_ORDER.indexOf(previousStage);
	const ate = STAGE_ORDER.indexOf(stage);
	if (de < 0 || ate < 0 || ate <= de) return [stage];
	return [...STAGE_ORDER.slice(de + 1, ate + 1)];
}

export async function registrarConversaoDoEstagio(
	leadId: string,
	stage: LeadStage,
	occurredAt?: Date,
	previousStage?: LeadStage,
): Promise<void> {
	// O legado marca SÓ o destino, de propósito. Ele mapeia `proposta_enviada` e
	// `fechado_ganho`, e varrer o caminho ali inventaria uma proposta entregue e
	// uma venda que ninguém verificou — o PRD §10 exige entrega e confirmação
	// financeira para esses dois. No V2 o único estágio mapeado é `qualificado`,
	// que deriva de um fato que ocorreu de verdade: o cliente deu CPF e celular.
	if (!contratoV2Ativo()) {
		const legado = ESTAGIO_PARA_EVENTO_LEGADO[stage];
		if (legado) await registrarConversao({ leadId, eventName: legado, occurredAt });
		return;
	}

	for (const percorrido of estagiosAtravessados(stage, previousStage)) {
		const eventName = ESTAGIO_PARA_EVENTO[percorrido];
		if (eventName)
			await registrarEventoDeConversao({
				eventName,
				leadId,
				occurredAt,
				previousStage,
				currentStage: percorrido,
			});
	}
}

/**
 * Marco do contrato anterior, com a chave de idempotência que produção já usa
 * (`<leadId>:<evento>`). Preservar a chave é o que impede o mesmo fechamento
 * de virar dois Purchase quando a flag do V2 for ligada e desligada.
 */
export async function registrarConversao(input: {
	leadId: string;
	eventName: LegacyConversionEventName;
	occurredAt?: Date;
}): Promise<void> {
	await gravarFato({
		eventName: input.eventName,
		leadId: input.leadId,
		occurredAt: input.occurredAt,
		montarChave: (ctx) => (ctx.leadId ? `${ctx.leadId}:${input.eventName}` : null),
	});
}
