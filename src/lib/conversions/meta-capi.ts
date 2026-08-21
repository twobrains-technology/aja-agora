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
	lead_qualificado: "Lead",
	proposta_criada: "InitiateCheckout",
	contrato_fechado: "Purchase",
};

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
	fbc: string | null;
	fbp: string | null;
	/** Item do catálogo (`auto-50000`). Nulo quando não deu para determinar. */
	contentId?: string | null;
	ctwaClid: string | null;
	actionSource: string;
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
			if (evento.fbc) userData.fbc = evento.fbc;
			if (evento.fbp) userData.fbp = evento.fbp;
			if (evento.ctwaClid) userData.ctwa_clid = evento.ctwaClid;

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
