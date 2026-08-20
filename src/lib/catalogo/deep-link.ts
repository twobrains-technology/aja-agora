// A outra ponta do catálogo: o anúncio promete "carta de R$ 50.000 por R$ 719",
// o clique chega em `/autos?bem=50000` e a landing precisa continuar a mesma
// conversa. Sem isto o cliente reconta ao chat o que já tinha dito ao clicar.
//
// Módulo PURO (só lê o parâmetro) para poder ser testado sozinho e usado tanto
// no `URLSearchParams` do cliente quanto no `searchParams` do server component.

import { CREDITO_MINIMO_PADRAO } from "@/lib/consorcio/credito-minimo";

type SearchParamsRecord = Record<string, string | string[] | undefined>;
export type EntradaDeBusca = URLSearchParams | SearchParamsRecord;

/** Teto de sanidade. Não é regra de negócio — o funil aceita qualquer valor
 * (FIX-218) e confronta na conversa. É só para uma URL adulterada
 * (`?bem=999999999999`) não virar fala do cliente com número absurdo. */
const TETO_DE_SANIDADE = 100_000_000;

function bruto(entrada: EntradaDeBusca, chave: string): string | undefined {
	if (entrada instanceof URLSearchParams) return entrada.get(chave) ?? undefined;
	const valor = entrada[chave];
	return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * O valor da carta que veio no link, ou `null` quando não veio / não serve.
 *
 * Tolerante na entrada porque o link é compartilhado e reescrito por gente:
 * `50000`, `50.000` e `R$ 50.000` são o mesmo valor. Rigoroso na saída: abaixo
 * do piso que a Bevi busca devolve `null`, e a landing abre normal em vez de
 * semear a conversa com um valor que o funil vai barrar.
 */
export function lerValorDoBem(entrada: EntradaDeBusca, chave = "bem"): number | null {
	const cru = bruto(entrada, chave);
	if (typeof cru !== "string") return null;

	const digitos = cru.replace(/\D/g, "");
	if (!digitos || digitos.length > 12) return null;

	const valor = Number(digitos);
	if (!Number.isFinite(valor) || valor > TETO_DE_SANIDADE) return null;
	if (valor < CREDITO_MINIMO_PADRAO) return null;

	return valor;
}
