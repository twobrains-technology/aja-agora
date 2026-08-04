// src/lib/attribution/params.ts
//
// Leitura dos parâmetros de campanha que chegam na URL. Módulo PURO (zero
// import, zero acesso a banco): é ele que decide se a chegada carrega origem
// de mídia, e essa decisão precisa ser testável sozinha.

/** Teto por valor. A query string é entrada de terceiro: ninguém escreve um romance numa UTM. */
const MAX_VALUE_LENGTH = 255;

export interface CampaignParams {
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
	utmContent: string | null;
	utmTerm: string | null;
	gclid: string | null;
	fbclid: string | null;
}

/** O que o server component do Next entrega em `searchParams`. */
type SearchParamsRecord = Record<string, string | string[] | undefined>;

export type CampaignParamsInput = URLSearchParams | SearchParamsRecord;

function readRaw(input: CampaignParamsInput, key: string): string | undefined {
	if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
	const value = input[key];
	// `?utm_campaign=a&utm_campaign=b` chega como array — fica o primeiro, mesma
	// escolha do URLSearchParams.get, pra não divergir entre os dois caminhos.
	return Array.isArray(value) ? value[0] : value;
}

function clean(input: CampaignParamsInput, key: string): string | null {
	const raw = readRaw(input, key);
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, MAX_VALUE_LENGTH);
}

/** Extrai UTM e click IDs de uma URL de chegada. Nunca lança. */
export function parseCampaignParams(input: CampaignParamsInput): CampaignParams {
	return {
		utmSource: clean(input, "utm_source"),
		utmMedium: clean(input, "utm_medium"),
		utmCampaign: clean(input, "utm_campaign"),
		utmContent: clean(input, "utm_content"),
		utmTerm: clean(input, "utm_term"),
		gclid: clean(input, "gclid"),
		fbclid: clean(input, "fbclid"),
	};
}

/**
 * A chegada carrega origem de mídia? Click ID sozinho conta: quando o
 * anunciante esquece de marcar UTM, o `gclid`/`fbclid` ainda identifica o
 * clique — e é justamente ele que Meta e Google exigem de volta pra casar a
 * conversão. Tratar isso como acesso direto seria jogar a atribuição fora.
 */
export function hasCampaignSignal(params: CampaignParams): boolean {
	return Object.values(params).some((value) => value !== null);
}
