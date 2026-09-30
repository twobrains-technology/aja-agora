// O recorte de VARIANTE do teste do telefone — a parte PURA.
//
// Módulo sem drizzle e sem servidor de propósito: o seletor de variante é um
// componente de CLIENTE, e ele precisa dos rótulos e da allowlist sem arrastar
// o driver do Postgres para o bundle do browser. O que toca SQL mora no irmão
// `filtro-variante.ts`.
//
// Mesmo desenho do `filtro-origem`: valor desconhecido NÃO é erro e não abre
// tela vazia — vira `null`, que é "todas as variantes". Um link velho ou
// adulterado (`?variante=C`) mostra o painel inteiro.

import { ehVarianteDoTelefone } from "@/lib/chat/variante-da-visita";

/** O balde de quem está fora do teste: WhatsApp, conversa pré-teste, pessoa sem
 *  conversa web. `A + B + sem-variante = todas` tem que fechar em toda tela. */
export const VARIANTE_SEM_VARIANTE = "sem-variante";

/** O cookie que faz o recorte atravessar a navegação. Cookie de SESSÃO (sem
 *  `max-age`): o recorte acompanha a navegação, mas não sobrevive a fechar o
 *  navegador — ninguém abre o painel amanhã vendo "só A" sem saber. */
export const COOKIE_DA_VARIANTE = "aja_variante";

/** O recorte efetivo. `null` = todas as variantes (o default). */
export type FiltroDeVariante = "A" | "B" | "sem-variante";

/** As opções do seletor, na ordem em que aparecem na tela. O rótulo é o texto
 *  visível — a cor nunca é o único sinal (o dono é daltônico). */
export const OPCOES_DE_VARIANTE: readonly {
	valor: FiltroDeVariante | null;
	rotulo: string;
}[] = [
	{ valor: null, rotulo: "Todas as variantes" },
	{ valor: "A", rotulo: "Variante A — telefone antes das ofertas" },
	{ valor: "B", rotulo: "Variante B — ofertas embaçadas" },
	{ valor: VARIANTE_SEM_VARIANTE, rotulo: "Sem variante" },
];

/**
 * A allowlist do recorte: `"A"`/`"B"` pelas variantes vivas do teste e o balde
 * `"sem-variante"`. Todo o resto — `"C"` legado, caixa errada, string vazia,
 * `"todas"`, número, `null` — devolve `null` ("todas"), nunca lança: é um valor
 * que chega de querystring e de cookie, ou seja, do usuário.
 */
export function lerFiltroDeVariante(valor: unknown): FiltroDeVariante | null {
	if (valor === VARIANTE_SEM_VARIANTE) return VARIANTE_SEM_VARIANTE;
	if (ehVarianteDoTelefone(valor)) return valor;
	return null;
}

/**
 * O texto do recorte ativo, para a tela dizer QUAL recorte está valendo —
 * nunca só a cor do controle.
 */
export function rotuloDoRecorte(filtro: FiltroDeVariante): string {
	if (filtro === VARIANTE_SEM_VARIANTE) return "Recorte: sem variante";
	return `Recorte: variante ${filtro}`;
}
