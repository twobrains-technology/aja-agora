/**
 * Formatação da tela de campanhas — dinheiro em centavos como o resto do schema,
 * e o número no padrão brasileiro. Um lugar só para a mesma vírgula aparecer no
 * cartão e na tabela.
 */

const BR = new Intl.NumberFormat("pt-BR");
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos → "R$ 1.234,56". */
export function reais(centavos: number): string {
	return BRL.format(centavos / 100);
}

/** Inteiro → "1.234". */
export function inteiro(valor: number): string {
	return BR.format(valor);
}

/**
 * Custo por lead qualificado, com o "sem base" explícito.
 *
 * `null` NÃO é zero: é "não houve qualificado no período". Mostrar "R$ 0,00"
 * afirmaria que o lead qualificado saiu de graça, quando o que aconteceu é que
 * não houve nenhum para dividir o gasto.
 */
export function custo(centavos: number | null): string {
	return centavos === null ? "sem base" : reais(centavos);
}
