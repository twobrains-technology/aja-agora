"use client";

// A BARRA de filtros — as partes compostas num lugar só.
//
// O painel tinha três desenhos de filtro convivendo: o período numa barra, os
// filtros do pipeline noutra, os de conversas noutra ainda. Cada um posicionava
// as peças do seu jeito, e a campanha (que é transversal) não tinha lugar
// nenhum — vivia como valor único, escondida em quem montava o link.
//
// Esta barra não decide nada sozinha: ela é a moldura onde as partes entram na
// mesma ordem em qualquer tela. As partes são:
//
//   1. **período** — o controle da tela, injetado. No painel é
//      `<DateRangeFilter />` (que continua sendo quem escreve URL e cookie do
//      período, com o comportamento de sempre); no pipeline e em conversas é o
//      par de datas próprio de cada uma, que não tem a semântica de cookie.
//   2. **campanha** — `<CampanhaFilter />`, múltiplo e com o estado na URL. Só
//      aparece quando a tela oferece campanhas; sem elas, some em vez de mostrar
//      um controle vazio.
//   3. **o resto** — `children`, o que cada tela já tinha (busca, canal, status,
//      o chip de origem, "Limpar").
//
// A ordem é fixa de propósito: período → campanha → o resto. Quem usa a barra
// em outra tela não precisa reinventar o layout, e a campanha para de depender
// de quem lembrou de renderizá-la.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CampanhaFilter, type OpcaoDeCampanha } from "./campanha-filter";

export function FiltrosDaTela({
	periodo,
	campanhas,
	children,
	className,
}: {
	/** O controle de período da tela. Opcional: nem toda barra tem um. */
	periodo?: ReactNode;
	/** As campanhas oferecidas ao filtro. Vazio/ausente esconde a parte. */
	campanhas?: readonly OpcaoDeCampanha[];
	/** O que cada tela já tinha, na ordem em que quer mostrar. */
	children?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			{periodo}
			{campanhas && campanhas.length > 0 ? <CampanhaFilter opcoes={campanhas} /> : null}
			{children}
		</div>
	);
}
