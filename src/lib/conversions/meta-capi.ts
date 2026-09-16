// src/lib/conversions/meta-capi.ts
//
// Adapter da Conversions API da Meta.
//
// Contrato conferido na doc oficial (Marketing API › Conversions API), não de
// memória:
//   POST https://graph.facebook.com/<versão>/<pixel_id>/events
//   { data: [ { event_name, event_time, event_id, action_source, user_data,
//               custom_data } ], test_event_code? }
//   - `event_time` em SEGUNDOS e no máximo 7 dias no passado;
//   - `em`/`ph` vão hasheados em SHA-256 (feito em `hash.ts`);
//   - `fbc`, `fbp` e `ctwa_clid` NÃO são hasheados;
//   - Click-to-WhatsApp usa `action_source: "business_messaging"` +
//     `messaging_channel: "whatsapp"` + `user_data.ctwa_clid`.

import type { ConversionsConfig } from "./config";

/** Nomes internos → nomes que a Meta entende. */
const NOME_META: Record<string, string> = {
	// Só para ler filas antigas durante a transição. O dispatcher V2 não as
	// seleciona novamente; preservar o mapeamento evita que ferramentas de
	// diagnóstico transformem um histórico em nome inválido.
	lead_qualificado: "Lead",
	proposta_criada: "InitiateCheckout",
	contrato_fechado: "Purchase",
	conversation_started: "ConversationStarted",
	lead: "Lead",
	qualified_lead: "QualifiedLead",
	offer_viewed: "OfferViewed",
	proposal_sent: "ProposalSent",
	purchase: "Purchase",
};

/**
 * Este evento tem nome que a Meta entende?
 *
 * É a allowlist do despacho: sem mapeamento, o evento sairia com o nome
 * interno e a Meta recusaria o lote inteiro. `chat_iniciado` fica
 * deliberadamente de fora — era abertura de UI e gerava os HTTP 400 que
 * contaminavam a fila comercial (PRD §6.2).
 */
export function temNomeMeta(eventName: string): boolean {
	return eventName in NOME_META;
}

/** A Meta recusa evento com mais de 7 dias. */
export const JANELA_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000;

export interface EventoParaEnvio {
	id: string;
	eventName: string;
	eventKey: string;
	occurredAt: Date;
	value: string | null;
	currency: string;
	hashedEmail: string | null;
	hashedPhone: string | null;
	externalId?: string | null;
	fbc: string | null;
	fbp: string | null;
	/** Item do catálogo (`auto-50000`). Nulo quando não deu para determinar. */
	contentId?: string | null;
	ctwaClid: string | null;
	clientUserAgent?: string | null;
	actionSource: string;
	campaignId?: string | null;
	adsetId?: string | null;
	adId?: string | null;
	previousStage?: string | null;
	currentStage?: string | null;
	proposalId?: string | null;
	saleId?: string | null;
}

export interface ResultadoEnvio {
	ok: boolean;
	/** Mensagem de erro pra gravar em `last_error` — nunca vazia quando `ok` é falso. */
	erro?: string;
}

/** Um evento velho demais nunca vai ser aceito: melhor marcar do que insistir. */
export function expirouParaMeta(evento: EventoParaEnvio, agoraMs = Date.now()): boolean {
	return agoraMs - evento.occurredAt.getTime() > JANELA_MAXIMA_MS;
}

export function montarPayload(eventos: EventoParaEnvio[], cfg: ConversionsConfig) {
	return {
		data: eventos.map((evento) => {
			const ehCtwa = evento.actionSource === "business_messaging";

			// Só campos presentes: mandar `null` piora a qualidade do match no
			// diagnóstico da Meta sem trazer nada.
			const userData: Record<string, unknown> = {};
			if (evento.hashedEmail) userData.em = [evento.hashedEmail];
			if (evento.hashedPhone) userData.ph = [evento.hashedPhone];
			if (evento.externalId) userData.external_id = [evento.externalId];
			if (evento.fbc) userData.fbc = evento.fbc;
			if (evento.fbp) userData.fbp = evento.fbp;
			if (evento.ctwaClid) userData.ctwa_clid = evento.ctwaClid;
			if (evento.clientUserAgent) userData.client_user_agent = evento.clientUserAgent;

			const customData: Record<string, unknown> = { currency: evento.currency };
			const valor = evento.value === null ? null : Number(evento.value);
			if (valor !== null && Number.isFinite(valor)) customData.value = valor;

			// O que liga a conversão ao CATÁLOGO. Sem estes dois campos a Meta sabe
			// que houve venda, mas não de qual carta — e anúncio de catálogo não
			// consegue remostrar o item certo a quem já olhou. `content_type` é
			// vocabulário fechado: só `product` ou `product_group`.
			if (evento.contentId) {
				customData.content_ids = [evento.contentId];
				customData.content_type = "product";
			}
			if (evento.campaignId) customData.campaign_id = evento.campaignId;
			if (evento.adsetId) customData.adset_id = evento.adsetId;
			if (evento.adId) customData.ad_id = evento.adId;
			if (evento.previousStage) customData.previous_stage = evento.previousStage;
			if (evento.currentStage) customData.current_stage = evento.currentStage;
			if (evento.proposalId) customData.proposal_id = evento.proposalId;
			if (evento.saleId) customData.sale_id = evento.saleId;

			return {
				event_name: NOME_META[evento.eventName] ?? evento.eventName,
				// Segundos, não milissegundos — em ms a Meta lê como ano 57000 e recusa.
				event_time: Math.floor(evento.occurredAt.getTime() / 1000),
				// Dedup: se o pixel do navegador mandar o mesmo marco, a Meta une os dois.
				event_id: evento.eventKey,
				action_source: evento.actionSource,
				...(ehCtwa ? { messaging_channel: "whatsapp" } : {}),
				user_data: userData,
				custom_data: customData,
			};
		}),
		...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
	};
}

export async function enviarParaMeta(
	eventos: EventoParaEnvio[],
	cfg: ConversionsConfig,
): Promise<ResultadoEnvio> {
	if (eventos.length === 0) return { ok: true };
	if (!cfg.pixelId || !cfg.accessToken) {
		return { ok: false, erro: "configuração incompleta (pixel ou token ausente)" };
	}

	const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.pixelId}/events`;

	try {
		const resposta = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				...montarPayload(eventos, cfg),
				access_token: cfg.accessToken,
			}),
		});

		if (!resposta.ok) {
			// O corpo do erro da Meta diz QUAL campo recusou — sem ele, diagnosticar
			// vira adivinhação.
			const corpo = await resposta.text().catch(() => "");
			return { ok: false, erro: `HTTP ${resposta.status}: ${corpo.slice(0, 500)}` };
		}

		return { ok: true };
	} catch (err) {
		return { ok: false, erro: `falha de rede: ${(err as Error).message}` };
	}
}
