/**
 * O CPC — o número que a cliente quer fechar, e o motivo honesto de ele faltar.
 *
 * `CustosDoCpc` chega com três custos e as contagens (o denominador). Este
 * módulo é PURO: só decide se dá para calcular e, se der, soma e divide.
 *
 * ── A lei, a mesma do resto da frente ───────────────────────────────────────
 *
 * **Faltando qualquer um dos três custos, o CPC é "não calculável" com o motivo
 * NOMEADO — nunca um número.** Um CPC somado por cima de um custo ausente seria
 * MENOR que a verdade, e a cliente decidiria verba com base num número que
 * mente para baixo. O motivo diz o que falta, e o que falta pede uma ação
 * diferente: cadastrar preço, cadastrar cotação, olhar a Meta, olhar o funil.
 */

import type { CustosDoCpc } from "@/lib/admin/performance-types";

export type MotivoSemCpc =
	| "sem_investimento"
	| "custo_de_ia_nao_calculavel"
	| "custo_de_mensagem_nao_calculavel"
	| "sem_qualificado";

export type Cpc =
	| { tipo: "valor"; centavos: number }
	| { tipo: "motivo"; motivo: MotivoSemCpc; explicacao: string };

const EXPLICACAO: Record<MotivoSemCpc, string> = {
	sem_investimento: "A Meta não reportou investimento neste período.",
	custo_de_ia_nao_calculavel: "O custo de IA não é calculável neste período.",
	custo_de_mensagem_nao_calculavel: "O custo de mensagem não é calculável neste período.",
	sem_qualificado: "Nenhum lead qualificado neste período — não há por quem dividir.",
};

/**
 * O CPC do período, ou o motivo pelo qual ele não existe.
 *
 * A ordem das guardas é a ordem do que trava o número: primeiro o investimento
 * (a base do CPC), depois os dois custos que se somam a ele, e por último o
 * denominador. Cada guarda devolve o motivo ESPECÍFICO, para a tela dizer qual.
 */
export function calcularCpc(custos: CustosDoCpc): Cpc {
	if (custos.investimentoMetaCents === null) {
		return { tipo: "motivo", motivo: "sem_investimento", explicacao: EXPLICACAO.sem_investimento };
	}

	if (custos.custoDeIA.tipo !== "valor") {
		return {
			tipo: "motivo",
			motivo: "custo_de_ia_nao_calculavel",
			explicacao: `${EXPLICACAO.custo_de_ia_nao_calculavel} ${custos.custoDeIA.explicacao}`,
		};
	}

	if (custos.custoDeMensagem.custo.tipo !== "valor") {
		return {
			tipo: "motivo",
			motivo: "custo_de_mensagem_nao_calculavel",
			explicacao: `${EXPLICACAO.custo_de_mensagem_nao_calculavel} ${custos.custoDeMensagem.custo.explicacao}`,
		};
	}

	if (custos.contagens.qualificados <= 0) {
		return { tipo: "motivo", motivo: "sem_qualificado", explicacao: EXPLICACAO.sem_qualificado };
	}

	const total =
		custos.investimentoMetaCents +
		custos.custoDeIA.brlCents +
		custos.custoDeMensagem.custo.centavos;

	return {
		tipo: "valor",
		centavos: Math.round(total / custos.contagens.qualificados),
	};
}
