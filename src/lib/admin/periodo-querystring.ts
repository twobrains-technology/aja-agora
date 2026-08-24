/**
 * O contrato do período na QUERYSTRING — um dia, não um instante.
 *
 * Mora fora do componente do filtro de propósito: assim as três telas e o teste
 * usam o mesmo parser sem arrastar React, `Calendar` e `Popover` junto. Quem
 * transforma o dia em janela de tempo é `resolverPeriodo`, no servidor.
 */

import { createParser } from "nuqs";
import { diaDoNegocio, instanteDoParametro } from "./periodo";

/**
 * O parser do DIA DO NEGÓCIO — e não o `parseAsIsoDate` do nuqs, que era o que
 * o painel usava.
 *
 * O do nuqs é bijetivo na string (`2026-08-19` entra e sai igual), e é por isso
 * que o defeito passou despercebido: o que ele erra é a DATA que devolve. Ele lê
 * com `new Date("2026-08-19")`, que é meia-noite UTC — 18/08 às 21h no Brasil —
 * e escreve com `toISOString().slice(0, 10)`, que a partir das 21h de Brasília
 * já é o dia seguinte. As duas pontas em UTC, num painel que só fala do dia
 * brasileiro.
 *
 * Na janela de 30 dias o erro de um dia era invisível. Com o painel abrindo em
 * HOJE, ele seria a diferença entre a tela mostrar o movimento de hoje ou o de
 * ontem — e ninguém teria como saber qual dos dois está vendo.
 */
export const parseAsDiaDoNegocio = createParser({
	parse: instanteDoParametro,
	serialize: diaDoNegocio,
});
