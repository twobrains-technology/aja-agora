// src/lib/conversions/config.ts
//
// A chave que liga o loop de otimização de mídia.
//
// Decisão (Kairo, 2026-08-03): o caminho server-side nasce COMPLETO, mas
// desligado. O fato de negócio é registrado desde já em `conversion_events`;
// só o ENVIO fica atrás da flag. Assim, no dia de ligar, existe histórico pra
// reenviar em vez de um funil vazio esperando encher.

export interface ConversionsConfig {
	/** `CONVERSIONS_API_ENABLED=true` liga o envio. Ausente = desligado. */
	enabled: boolean;
	pixelId: string | null;
	accessToken: string | null;
	apiVersion: string;
	/** Código do Test Events do Gerenciador — valida sem sujar a conta real. */
	testEventCode: string | null;
}

/** Versão fixada de propósito: a Graph API quebra contrato entre versões. */
const VERSAO_PADRAO = "v21.0";

export function getConversionsConfig(): ConversionsConfig {
	return {
		enabled: process.env.CONVERSIONS_API_ENABLED === "true",
		pixelId: process.env.META_PIXEL_ID?.trim() || null,
		accessToken: process.env.META_CAPI_ACCESS_TOKEN?.trim() || null,
		apiVersion: process.env.META_GRAPH_API_VERSION?.trim() || VERSAO_PADRAO,
		testEventCode: process.env.META_CAPI_TEST_EVENT_CODE?.trim() || null,
	};
}

/**
 * Por que o envio está (ou não) liberado. Devolve o motivo, e não só um
 * booleano, pra que o log diga "faltou o token" em vez de deixar alguém
 * procurando por que a fila não anda.
 */
export function motivoParaNaoEnviar(cfg: ConversionsConfig): string | null {
	if (!cfg.enabled) return "CONVERSIONS_API_ENABLED não está ligada";
	if (!cfg.pixelId) return "META_PIXEL_ID ausente";
	if (!cfg.accessToken) return "META_CAPI_ACCESS_TOKEN ausente";
	return null;
}
