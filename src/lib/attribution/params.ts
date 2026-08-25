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

/** Separador improvável dentro de uma UTM — evita que "a|b" e "a" + "|b" colidam. */
const SEPARADOR = "\u0001";

/**
 * A assinatura do CRIATIVO desta chegada — `null` quando não há mídia na URL.
 *
 * Existe porque `hasCampaignSignal` responde a pergunta errada para decidir
 * visita. Ele diz SE há campanha; o que decide se a pessoa chegou de novo é QUAL
 * campanha. Enquanto a decisão foi tomada sobre o booleano, toda requisição
 * repetida carregando os mesmos UTMs abria uma visita: medido em produção em
 * 24/08/2026, 181 de 830 chegadas (21,8%) eram o mesmo visitante com o mesmo
 * criativo em menos de 30 minutos — refresh contado como aquisição.
 *
 * FNV-1a de 32 bits em base36: cabe em 7 caracteres, não tem ponto (que é o
 * separador do cookie) e é determinístico sem depender de `crypto` — este módulo
 * roda no proxy, e é chamado em toda chegada. Não é hash de segurança e não
 * precisa ser: colisão aqui funde duas chegadas de criativos diferentes numa,
 * e o espaço de criativos simultâneos de uma operação é da ordem de dezenas.
 */
export function assinaturaDaCampanha(params: CampaignParams): string | null {
	if (!hasCampaignSignal(params)) return null;

	const texto = [
		params.utmSource,
		params.utmMedium,
		params.utmCampaign,
		params.utmContent,
		params.utmTerm,
		params.gclid,
		params.fbclid,
	]
		.map((valor) => valor ?? "")
		.join(SEPARADOR);

	let hash = 0x811c9dc5;
	for (let i = 0; i < texto.length; i++) {
		hash ^= texto.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}

	return hash.toString(36);
}
