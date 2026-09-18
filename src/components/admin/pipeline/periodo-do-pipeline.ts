/**
 * O PERÍODO EFETIVO do Pipeline — quando não há escolha, o quadro abre inteiro.
 *
 * O resto do painel abre em HOJE (`periodo.ts`): a pergunta do dia a dia é "o
 * que está acontecendo hoje". O Kanban não pode seguir essa regra, e o motivo é
 * o próprio objeto da tela: um quadro de leads vazio não se lê como "hoje não
 * entrou ninguém", se lê como "a tela quebrou". Além disso, até este commit o
 * Pipeline não recortava por data quando não havia período — mostrava TODOS os
 * leads enquanto o chip dizia "Hoje", duas afirmações diferentes na mesma tela.
 *
 * A precedência é a mesma do painel, com o último degrau trocado:
 *
 *   1. a URL (`from`/`to`), que é o que o `<DateRangeFilter/>` escreve;
 *   2. o cookie `aja_periodo`, a escolha que acompanha a pessoa;
 *   3. **"Desde o início"** (`INICIO_DO_COLETOR` → hoje), e não "hoje".
 *
 * Cada campo cai para o degrau seguinte sozinho, como no filtro compartilhado
 * (`fromUrl ?? …`), para um link com só uma das pontas não inventar a outra.
 *
 * Função PURA: o cookie chega como STRING (`document.cookie`) e o "hoje" é
 * injetável — roda igual no teste e no navegador, sem React e sem relógio.
 */

import {
	COOKIE_DO_PERIODO,
	diaComoData,
	diaDeHoje,
	diasDoCookie,
	INICIO_DO_COLETOR,
	valorDoCookie,
} from "@/lib/admin/periodo";

export interface PeriodoEfetivoDoPipeline {
	/** Primeiro dia do recorte, ancorado ao meio-dia UTC. */
	de: Date;
	/** Último dia do recorte, ancorado ao meio-dia UTC. */
	ate: Date;
}

export function periodoEfetivoDoPipeline(
	fromUrl: Date | null,
	toUrl: Date | null,
	cookiesDoDocumento: string | null,
	hoje: Date = diaDeHoje(),
): PeriodoEfetivoDoPipeline {
	const doCookie = diasDoCookie(valorDoCookie(cookiesDoDocumento ?? "", COOKIE_DO_PERIODO));

	return {
		de: fromUrl ?? diaComoData(doCookie?.de ?? INICIO_DO_COLETOR),
		ate: toUrl ?? (doCookie ? diaComoData(doCookie.ate) : hoje),
	};
}
