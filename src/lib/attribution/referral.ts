// src/lib/attribution/referral.ts
//
// Click-to-WhatsApp: a Meta entrega a origem do anúncio em
// `messages[].referral` — e SÓ na primeira mensagem depois do clique. Não há
// segunda chance: se o webhook não ler aqui, a conversa fica órfã de origem
// pra sempre e a campanha de CTWA vira gasto sem leitura.
//
// Doc do payload: WhatsApp Cloud API › Webhooks › Messages › `referral`.

const MAX_VALUE_LENGTH = 255;

export interface CtwaReferral {
	/** Click ID do Click-to-WhatsApp — o que a Conversions API pede de volta. */
	ctwaClid: string | null;
	/** ID do anúncio/post que originou a conversa. */
	sourceId: string | null;
	sourceUrl: string | null;
	/** "ad" ou "post". */
	sourceType: string | null;
	headline: string | null;
}

function clean(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, MAX_VALUE_LENGTH);
}

/**
 * Lê o `referral` de uma mensagem inbound. Devolve `null` quando a mensagem
 * não veio de anúncio (o caso comum) ou quando o payload não trouxe nenhum
 * campo aproveitável — não queremos linha de visita sem nenhuma origem dentro.
 */
export function parseCtwaReferral(raw: unknown): CtwaReferral | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

	const source = raw as Record<string, unknown>;
	const referral: CtwaReferral = {
		ctwaClid: clean(source.ctwa_clid),
		sourceId: clean(source.source_id),
		sourceUrl: clean(source.source_url),
		sourceType: clean(source.source_type),
		headline: clean(source.headline),
	};

	const temOrigem = Object.values(referral).some((value) => value !== null);
	return temOrigem ? referral : null;
}
