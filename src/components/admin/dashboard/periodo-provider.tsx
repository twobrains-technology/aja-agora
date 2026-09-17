"use client";

// O período com que o painel abre — decidido no SERVIDOR e entregue ao cliente.
//
// O cliente não consegue ler cookie no primeiro render (e ler `document.cookie`
// durante o render causaria divergência de hidratação), mas é o cliente que
// monta o `withDefault` do filtro. Sem este provider, o filtro abriria em HOJE
// enquanto as rotas abririam no período do cookie — as duas pontas falariam de
// janelas diferentes na primeira tela. O layout, que é server component, lê o
// cookie e passa os DIAS por aqui.

import { createContext, useContext, useMemo } from "react";
import { diaComoData, diaDeHoje } from "@/lib/admin/periodo";

export interface PeriodoDoPainel {
	/** O primeiro dia mostrado no filtro, ancorado ao meio-dia UTC. */
	de: Date;
	/** O último dia mostrado no filtro, ancorado ao meio-dia UTC. */
	ate: Date;
	/**
	 * `true` quando o padrão veio do COOKIE (a pessoa já escolheu um período).
	 *
	 * O filtro usa isto para decidir se vale escrever o período na URL ao
	 * montar: quando o padrão é só "hoje", não há nada para transportar e a URL
	 * fica limpa (e o primeiro fetch não é duplicado).
	 */
	veioDoCookie: boolean;
}

const PadraoDoPeriodo = createContext<PeriodoDoPainel | null>(null);

export function PeriodoProvider({
	de,
	ate,
	veioDoCookie = false,
	children,
}: {
	/** Dias do negócio (`YYYY-MM-DD`), como cabem num prop de server component. */
	de: string;
	ate: string;
	veioDoCookie?: boolean;
	children: React.ReactNode;
}) {
	const valor = useMemo<PeriodoDoPainel>(
		() => ({ de: diaComoData(de), ate: diaComoData(ate), veioDoCookie }),
		[de, ate, veioDoCookie],
	);

	return <PadraoDoPeriodo.Provider value={valor}>{children}</PadraoDoPeriodo.Provider>;
}

/**
 * O período padrão da tela.
 *
 * Sem provider (teste, ou uma tela que ainda não foi migrada) devolve HOJE, o
 * mesmo chão da precedência — nunca `undefined`, para o filtro não quebrar.
 */
export function usePeriodoPadrao(): PeriodoDoPainel {
	const contexto = useContext(PadraoDoPeriodo);
	return contexto ?? { de: diaDeHoje(), ate: diaDeHoje(), veioDoCookie: false };
}
