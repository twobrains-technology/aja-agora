// src/lib/conversions/registry.ts
//
// Registra o FATO de negócio: um marco do funil foi atingido por um lead.
//
// Separado do envio de propósito. O fato é gravado sempre — com a flag ligada
// ou desligada — porque é ele que permite ligar a chave depois e reenviar o
// histórico. O envio é responsabilidade de `dispatch.ts`.
//
// Como em todo o caminho de atribuição: registrar conversão NUNCA derruba a
// venda. Falhou, loga e segue.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, conversionEvents, leads, visits } from "@/db/schema";
import type { LeadStage } from "@/lib/admin/lead-stages";
import { hashEmail, hashPhone, montarFbc } from "./hash";

export type ConversionEventName = "lead_qualificado" | "proposta_criada" | "contrato_fechado";

/**
 * Quais estágios do funil viram sinal pra mídia.
 *
 * Deliberadamente poucos. Mandar todo estágio ensinaria o algoritmo a buscar
 * quem CONVERSA, não quem COMPRA — e é justamente o contrário do que a operação
 * quer otimizar. `qualificado` entra por volume (o algoritmo precisa de sinal
 * frequente pra aprender), `fechado_ganho` por ser a verdade do negócio.
 */
const ESTAGIO_PARA_EVENTO: Partial<Record<LeadStage, ConversionEventName>> = {
	qualificado: "lead_qualificado",
	proposta_enviada: "proposta_criada",
	fechado_ganho: "contrato_fechado",
};

export function eventoDoEstagio(stage: LeadStage): ConversionEventName | null {
	return ESTAGIO_PARA_EVENTO[stage] ?? null;
}

/**
 * Registra o marco. Idempotente pela chave `<leadId>:<evento>`: a mesma
 * transição disparada duas vezes (retry, reentrega de webhook, admin clicando
 * de novo) não vira dois sinais — o índice único no banco é quem garante,
 * não a boa vontade do chamador.
 */
export async function registrarConversao(input: {
	leadId: string;
	eventName: ConversionEventName;
	occurredAt?: Date;
}): Promise<void> {
	try {
		const lead = await db.query.leads.findFirst({
			where: eq(leads.id, input.leadId),
		});
		if (!lead) return;

		// Lead de teste nunca vira sinal de mídia — ensinar o algoritmo com
		// conversa de simulador é pior do que não ensinar nada.
		if (lead.isSimulated) return;

		const conversa = await db.query.conversations.findFirst({
			where: eq(conversations.id, lead.conversationId),
		});

		const visita = conversa?.visitId
			? await db.query.visits.findFirst({ where: eq(visits.id, conversa.visitId) })
			: null;

		// Click-to-WhatsApp exige `action_source` próprio; o resto é web.
		const ehCtwa = Boolean(visita?.ctwaClid);

		await db
			.insert(conversionEvents)
			.values({
				leadId: lead.id,
				conversationId: lead.conversationId,
				visitId: conversa?.visitId ?? null,
				eventName: input.eventName,
				destination: "meta",
				eventKey: `${lead.id}:${input.eventName}`,
				occurredAt: input.occurredAt ?? new Date(),
				value: lead.creditValue,
				currency: "BRL",
				// PII só entra hasheada — esta tabela não é cópia do cadastro.
				hashedEmail: hashEmail(lead.email),
				hashedPhone: hashPhone(lead.phone),
				fbc: montarFbc(visita?.fbclid, visita?.createdAt?.getTime() ?? Date.now()),
				fbp: null,
				ctwaClid: visita?.ctwaClid ?? null,
				actionSource: ehCtwa ? "business_messaging" : "website",
			})
			.onConflictDoNothing();
	} catch (err) {
		console.error("[conversions] falha ao registrar conversão:", err);
	}
}

/** Atalho pro caminho que dispara de verdade: uma transição de estágio. */
export async function registrarConversaoDoEstagio(
	leadId: string,
	stage: LeadStage,
	occurredAt?: Date,
): Promise<void> {
	const eventName = eventoDoEstagio(stage);
	if (!eventName) return;
	await registrarConversao({ leadId, eventName, occurredAt });
}
