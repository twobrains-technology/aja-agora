/**
 * FIX-401 — a LEITURA do resultado do A/B do telefone, sem React.
 *
 * Mora fora do componente de propósito: a regra que decide a TELA ("o que este
 * número diz?") é testável sem renderizar nada, e é a mesma que o dono vai ler
 * no dia 01/10 para dizer qual caminho foi melhor.
 *
 * Duas regras herdadas da leitura do banco (`resultado-do-teste-do-telefone.ts`)
 * e mantidas aqui, no ponto onde viram texto:
 *
 *  - **`null` ⇒ "não calculável", nunca `0`.** Zero afirma que ninguém
 *    converteu; "não calculável" diz a verdade — ainda não caiu visita aqui.
 *    Com amostra pequena, a diferença decide se alguém tira conclusão de um
 *    lado vazio.
 *  - **A meta aparece por RÓTULO** ("meta atingida" / "faltam N"), nunca só
 *    pela cor — quem lê por leitor de tela ou imprime em preto e branco precisa
 *    do mesmo estado.
 */

import type { ResultadoPorVariante } from "@/lib/chat/resultado-do-teste-do-telefone";

/** A régua da leitura: ≥30 visitas por variante é a amostra mínima que a call
 *  fixou para o número valer alguma coisa (Kairo, 29/09, 12:15). */
export const META_DE_VISITAS_POR_VARIANTE = 30;

/** A ausência de dado tem UM texto na tela inteira — não "—", não "0", não "NaN". */
export const NAO_CALCULAVEL = "não calculável";

const BR = new Intl.NumberFormat("pt-BR");
// `percent` multiplica por 100 e formata no padrão brasileiro: 0.25 → "25%",
// 0.256 → "25,6%". A vírgula decimal sai daqui, não de `toFixed`.
const PORCENTAGEM = new Intl.NumberFormat("pt-BR", {
	style: "percent",
	maximumFractionDigits: 1,
});

/** O estado da meta em rótulo — o texto que sobrevive a impressão sem cor. */
export function rotuloDaMeta(visitas: number): string {
	if (visitas >= META_DE_VISITAS_POR_VARIANTE) return "meta atingida";
	return `faltam ${BR.format(META_DE_VISITAS_POR_VARIANTE - visitas)}`;
}

/** Uma variante já pronta para a tela: número formatado, nunca `null` cru. */
export interface LeituraDaVariante {
	variante: string;
	visitas: string;
	telefones: string;
	naComparacao: string;
	taxa: string;
	meta: string;
	/** `true` só quando há dado E a meta foi batida — a cor é o reforço, o rótulo é o estado. */
	metaAtingida: boolean;
}

export function lerVarianteDoTeste(resultado: ResultadoPorVariante): LeituraDaVariante {
	const { visitas, telefones, naComparacao, taxaDeTelefone } = resultado;
	return {
		variante: resultado.variante,
		visitas: visitas === null ? NAO_CALCULAVEL : BR.format(visitas),
		telefones: telefones === null ? NAO_CALCULAVEL : BR.format(telefones),
		naComparacao: naComparacao === null ? NAO_CALCULAVEL : BR.format(naComparacao),
		taxa: taxaDeTelefone === null ? NAO_CALCULAVEL : PORCENTAGEM.format(taxaDeTelefone),
		meta: visitas === null ? NAO_CALCULAVEL : rotuloDaMeta(visitas),
		metaAtingida: visitas !== null && visitas >= META_DE_VISITAS_POR_VARIANTE,
	};
}

/** O total das duas variantes — `null` quando nenhuma visita entrou no teste. */
export interface LeituraDoTotal {
	visitas: string;
	telefones: string;
	naComparacao: string;
}

export function lerTotalDoTeste(
	total: { visitas: number; telefones: number; naComparacao: number } | null,
): LeituraDoTotal {
	if (total === null) {
		return {
			visitas: NAO_CALCULAVEL,
			telefones: NAO_CALCULAVEL,
			naComparacao: NAO_CALCULAVEL,
		};
	}
	return {
		visitas: BR.format(total.visitas),
		telefones: BR.format(total.telefones),
		naComparacao: BR.format(total.naComparacao),
	};
}
