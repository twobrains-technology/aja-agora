// O `title` de quem mostra uma origem no painel.
//
// A tela passou a mostrar o NOME da campanha e a guardar o rótulo cru no
// `title`. O rótulo cru, porém, não identificava: medido em 17/09/2026 na conta
// `act_1594922312055163`, o sufixo de seis dígitos casa com dois anúncios
// diferentes — e o painel pode estar apontando o anúncio errado sem que
// ninguém perceba, porque id abreviado PARECE identificador.
//
// Aqui o `title` leva as duas coisas que identificam de verdade: o nome oficial
// da campanha e o id inteiro, de 18 dígitos, como se cola no gerenciador.
//
// **Sem resolução, o `title` é exatamente o rótulo de antes.** É a mesma
// escolha de `descreverOrigem`: não saber não é erro, e apagar o que já
// aparecia seria pior que o problema original — o espelho local pode ainda não
// ter sincronizado.
//
// Mora num módulo próprio porque quatro telas (lead, contato, percurso e o
// card) mostram a mesma origem: duas cópias do texto divergiriam na primeira
// mudança de copy.

import type { Origem } from "./origem-label";

/**
 * O texto do `title` para uma origem: nome oficial + id completo + rótulo cru.
 *
 * Nunca vazio: quando o resolvedor não conhece a campanha, devolve o `label`,
 * que é o que o painel já mostrava.
 */
export function tituloDaOrigem(origem: Origem): string {
	const nome = origem.nomeDaCampanha?.trim() || null;
	const id = origem.entityId?.trim() || null;

	// Sem nome e sem id não há nada a acrescentar: o rótulo cru de antes.
	if (!nome && !id) return origem.label;

	const partes: string[] = [];
	if (nome) partes.push(nome);
	if (id) partes.push(`id completo: ${id}`);
	// O rótulo cru fica junto de propósito: é o valor que a busca e o filtro
	// usam, e quem cola o `utm_campaign` no gerenciador precisa dele inteiro.
	return `${partes.join(" · ")} · ${origem.label}`;
}
