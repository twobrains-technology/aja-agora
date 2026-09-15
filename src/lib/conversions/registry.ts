// Fonte única dos fatos de conversão V2. Endpoints e workers registram fatos;
// só este módulo conhece a fila/atribuição da Meta.
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { beviProposals, conversations, conversionEvents, leads, visits } from "@/db/schema";
import type { LeadStage } from "@/lib/admin/lead-stages";
import { contentIdDoEvento, numeroOuNulo } from "./conteudo-do-evento";
import { hashEmail, hashExternalId, hashPhone, montarFbc } from "./hash";

export type ConversionEventName =
	| "conversation_started"
	| "lead"
	| "qualified_lead"
	| "offer_viewed"
	| "proposal_sent"
	| "purchase";

const ESTAGIO_PARA_EVENTO: Partial<Record<LeadStage, ConversionEventName>> = {
	qualificado: "qualified_lead",
};

export function contratoV2Ativo(): boolean {
	return process.env.META_CONVERSION_CONTRACT_V2_ENABLED === "true";
}

export function eventoDoEstagio(stage: LeadStage): ConversionEventName | null {
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
		const eventKey = chave({ ...input, leadId: lead?.id ?? input.leadId, conversationId });
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
		console.error("[conversions] falha ao registrar fato V2:", error);
	}
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

export async function registrarConversaoDoEstagio(
	leadId: string,
	stage: LeadStage,
	occurredAt?: Date,
	previousStage?: LeadStage,
): Promise<void> {
	const eventName = eventoDoEstagio(stage);
	if (eventName)
		await registrarEventoDeConversao({
			eventName,
			leadId,
			occurredAt,
			previousStage,
			currentStage: stage,
		});
}

/** Compatibilidade de leitura/testes do contrato antigo; produção V2 não chama. */
export async function registrarConversao(_input: {
	leadId: string;
	eventName: "lead_qualificado" | "proposta_criada" | "contrato_fechado";
	occurredAt?: Date;
}): Promise<void> {
	// Eventos legados não são reinterpretados nem reenviados pelo contrato V2.
}
