import { asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { conversionEvents, leads } from "@/db/schema";

/** O que o GTM empurra. Os nomes são os do contrato V2, em snake_case. */
export interface MarcoParaDataLayer {
	event: string;
	event_id: string;
	journey_stage: string;
	transaction_id?: string;
	value?: number;
	currency?: string;
}

/**
 * Os marcos já registrados desta conversa, prontos para o `dataLayer`.
 *
 * Existe por um motivo só: **o `event_id` tem que ser o mesmo dos dois lados.**
 * A Meta deduplica Pixel × CAPI pelo par `event_name` + `event_id`; se o
 * navegador sortear um id próprio, o mesmo fato vira duas conversões — e o
 * sintoma é uma métrica que SOBE, que é o tipo de defeito que ninguém
 * investiga. Por isso a chave sai de `conversion_events`, nunca do browser.
 *
 * Sem PII: nome, id, estágio e, na venda, identificador e valor. Nada de
 * e-mail, telefone, CPF ou texto de conversa.
 */
export async function marcosDaConversa(conversationId: string): Promise<MarcoParaDataLayer[]> {
	// `conversation_started` é gravado só com a conversa; os demais carregam o
	// lead. Pegar pelos dois lados é o que devolve a jornada inteira.
	const doLead = db
		.select({ id: leads.id })
		.from(leads)
		.where(eq(leads.conversationId, conversationId));

	const linhas = await db
		.select({
			eventName: conversionEvents.eventName,
			eventKey: conversionEvents.eventKey,
			occurredAt: conversionEvents.occurredAt,
			value: conversionEvents.value,
			currency: conversionEvents.currency,
			proposalId: conversionEvents.proposalId,
			saleId: conversionEvents.saleId,
		})
		.from(conversionEvents)
		.where(
			or(
				eq(conversionEvents.conversationId, conversationId),
				inArray(conversionEvents.leadId, doLead),
			),
		)
		.orderBy(asc(conversionEvents.occurredAt));

	return linhas.map((linha) => {
		const marco: MarcoParaDataLayer = {
			event: linha.eventName,
			event_id: linha.eventKey,
			journey_stage: linha.eventName,
		};
		// Venda carrega dinheiro; o resto não inventa valor.
		if (linha.eventName === "purchase") {
			const valor = linha.value === null ? null : Number(linha.value);
			if (valor !== null && Number.isFinite(valor)) {
				marco.value = valor;
				marco.currency = linha.currency;
			}
			const transacao = linha.saleId ?? linha.proposalId;
			if (transacao) marco.transaction_id = transacao;
		}
		return marco;
	});
}

export async function GET(request: Request) {
	const conversationId = new URL(request.url).searchParams.get("conversationId");
	if (!conversationId) {
		return Response.json({ erro: "conversationId é obrigatório" }, { status: 400 });
	}

	const eventos = await marcosDaConversa(conversationId);

	// Nunca cachear: o navegador consulta de novo a cada turno e o que muda é
	// justamente o que acabou de ser registrado.
	return Response.json({ eventos }, { headers: { "Cache-Control": "no-store" } });
}
