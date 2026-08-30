// src/lib/conversions/inicio-de-conversa.ts
//
// B3 — "esta pessoa começou a conversar", dito ao servidor.
//
// ── O buraco ────────────────────────────────────────────────────────────────
//
// A planilha do Gustavo aponta trocar o evento de otimização das campanhas de
// tráfego para "início de conversa" como a ação de maior impacto estimado da
// aba de mídia (+50% a +90% relativo em %Conv Chat). Ensinar o algoritmo a
// buscar quem CONVERSA, e não quem clica, é a diferença entre pagar por sessão
// e pagar por interesse.
//
// Só que o `ChatIniciado` existia **apenas no navegador** — `trackCustom` do
// pixel, em `meta-pixel.ts`. Otimizar uma campanha por um evento que só existe
// client-side é o caminho frágil, e frágil do pior jeito: bloqueador de
// anúncio, ITP do iOS e falha de rede não comem sinal ao acaso, comem
// preferencialmente o público que mais importa. A campanha aprenderia com uma
// amostra enviesada e ninguém veria nada errado no Gerenciador.
//
// ── Por que é SINAL e não conversão de negócio ──────────────────────────────
//
// `registry.ts` guarda três marcos (qualificado, proposta, contrato) e o
// comentário de `schema.ts` explica a lista curta: evento demais ensina o
// algoritmo a buscar curioso. Quem abre o chat é interesse, não compra. Então
// este evento nasce ao lado, nunca no meio: chave própria, **nunca com
// `value`**, e no Gerenciador ele vira uma conversão personalizada separada dos
// três de venda. Misturar seria cometer exatamente o erro que a lista curta
// existe para evitar.
//
// ── Deduplicação com o pixel ────────────────────────────────────────────────
//
// O mesmo início de conversa chega à Meta por dois caminhos (pixel e CAPI), e
// sem um id compartilhado ela contaria dois. O `eventId` é sorteado no CLIENTE,
// no instante da abertura, e vai para os dois lados: para o pixel como
// `eventID`, para cá como `eventKey`. É o mesmo desenho do `<leadId>:<evento>`
// do `registry.ts`, com a âncora que este evento tem — a abertura, que ainda
// não tem lead nenhum.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversations, conversionEvents, leads, visits } from "@/db/schema";
import { chaveDoInicioDeConversa } from "./chave-do-inicio-de-conversa";
import { hashPhone, montarFbc } from "./hash";

export interface InicioDeConversaInput {
	/**
	 * Id sorteado no cliente na abertura do teatro, compartilhado com o pixel.
	 * É ele que faz a Meta reconhecer pixel e CAPI como o MESMO evento.
	 */
	eventId: string;
	/** A visita corrente, resolvida do cookie pelo endpoint. */
	visitId: string | null;
	/** A conversa, quando já existe (WhatsApp; na web ela nasce depois). */
	conversationId?: string | null;
	occurredAt?: Date;
}

/**
 * Registra o início de conversa como evento pendente de envio.
 *
 * Best-effort, como todo o caminho de conversão: falhar aqui custa um sinal de
 * mídia, jamais a conversa. `onConflictDoNothing` sobre a chave única faz o
 * reenvio do beacon (o `sendBeacon` não sabe se chegou, e o React 18 monta duas
 * vezes em dev) ser inofensivo.
 */
export async function registrarInicioDeConversa(input: InicioDeConversaInput): Promise<void> {
	try {
		const eventKey = chaveDoInicioDeConversa(input.eventId);

		const visita = input.visitId
			? await db.query.visits.findFirst({ where: eq(visits.id, input.visitId) })
			: null;

		const conversa = input.conversationId
			? await db.query.conversations.findFirst({
					where: eq(conversations.id, input.conversationId),
				})
			: null;

		// Conversa de teste nunca vira sinal de mídia — a mesma regra do
		// `registry.ts`, pelo mesmo motivo: ensinar o algoritmo com conversa de
		// simulador é pior do que não ensinar nada.
		if (conversa?.isSimulated) return;

		// O TELEFONE, quando ele já se conhece — e no WhatsApp ele se conhece desde
		// o primeiro segundo, porque o `waId` É o número. Isto é o que separa um
		// evento de correspondência fraca de um forte: a auditoria de EMQ (item B2)
		// mediu, em produção, 39 de 42 eventos com telefone e ZERO com e-mail. Sem
		// nenhum dos dois, a Meta aceita o evento e o casa com quase ninguém.
		const telefone = conversa?.waId ?? (await telefoneDaConversa(input.conversationId));

		// `business_messaging` é obrigatório para evento originado em conversa de
		// WhatsApp; o resto é `website`. Mandar `website` para um evento de CTWA faz
		// a Meta recusar a atribuição sem dizer por quê.
		const ehMensageria = Boolean(conversa?.channel === "whatsapp" || visita?.ctwaClid);

		await db
			.insert(conversionEvents)
			.values({
				leadId: null,
				conversationId: conversa?.id ?? null,
				visitId: visita?.id ?? null,
				eventName: "chat_iniciado",
				destination: "meta",
				eventKey,
				occurredAt: input.occurredAt ?? new Date(),
				// SEM `value`, sempre. Ver o cabeçalho: este evento é sinal de
				// interesse, e um valor aqui o faria disputar a otimização de receita
				// com os três marcos de venda.
				value: null,
				currency: "BRL",
				hashedEmail: null,
				hashedPhone: hashPhone(telefone),
				fbc: montarFbc(visita?.fbclid, visita?.createdAt?.getTime() ?? Date.now()),
				fbp: visita?.fbp ?? null,
				ctwaClid: visita?.ctwaClid ?? null,
				actionSource: ehMensageria ? "business_messaging" : "website",
			})
			.onConflictDoNothing();
	} catch (err) {
		console.error("[conversions] falha ao registrar início de conversa:", err);
	}
}

/**
 * O telefone que a conversa já conhece, pelo lead ou pelo contato unificado.
 *
 * Vale a consulta extra porque telefone é o campo de correspondência que a
 * nossa operação de fato tem (nunca coletamos e-mail), e é ele que decide se
 * este evento chega à Meta como pessoa ou como sombra.
 */
async function telefoneDaConversa(conversationId?: string | null): Promise<string | null> {
	if (!conversationId) return null;

	const lead = await db.query.leads.findFirst({
		where: eq(leads.conversationId, conversationId),
	});
	if (lead?.phone) return lead.phone;

	const conversa = await db.query.conversations.findFirst({
		where: eq(conversations.id, conversationId),
	});
	if (!conversa?.contactId) return null;

	const contato = await db.query.contacts.findFirst({
		where: eq(contacts.id, conversa.contactId),
	});
	return contato?.phone ?? null;
}
