/**
 * Formatação da tela de campanhas — dinheiro em centavos como o resto do schema,
 * e o número no padrão brasileiro. Um lugar só para a mesma vírgula aparecer no
 * cartão e na tabela.
 */

import type { CustoPorQualificado, MotivoSemCusto } from "@/lib/admin/campanhas-queries";

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
 * O que a célula de custo mostra — texto, ícone e a explicação de "o que fazer".
 *
 * `motivo` é o que decide o ícone (o componente mapeia para lucide); `null`
 * significa que há valor. A separação existe para o teste provar a COPY sem
 * precisar renderizar React.
 */
export interface CustoDescrito {
	texto: string;
	motivo: MotivoSemCusto | null;
	tooltip: string;
}

const MOTIVOS: Record<MotivoSemCusto, CustoDescrito> = {
	sem_qualificado: {
		texto: "Sem qualificado no período",
		motivo: "sem_qualificado",
		tooltip:
			"Houve investimento e a campanha tem vínculo com o CRM, mas nenhum lead chegou a qualificado no período. Não é custo zero: é custo que ainda não dá para calcular — vale olhar o funil, não a verba.",
	},
	sem_gasto: {
		texto: "Sem gasto informado",
		motivo: "sem_gasto",
		tooltip:
			"O gerenciador não reportou investimento para esta campanha no período. Confira se a campanha está ativa e se o ciclo de sincronização com a Meta está rodando.",
	},
	sem_vinculo: {
		texto: "Sem vínculo com o CRM",
		motivo: "sem_vinculo",
		tooltip:
			"A campanha gastou, mas nenhuma visita ou conversa do CRM aponta para ela. O problema é de atribuição: confira a UTM/template do anúncio e se a campanha já está espelhada pelo sync.",
	},
};

/**
 * Custo por lead qualificado, com o MOTIVO explícito quando não há número.
 *
 * `null` nunca é zero: mostrar "R$ 0,00" afirmaria que o lead qualificado saiu de
 * graça. E 'sem base' — a resposta antiga — juntava três problemas diferentes
 * (sem vínculo, sem gasto, sem qualificado) sob um rótulo que não mandava
 * ninguém a lugar nenhum.
 */
export function descreverCusto(custo: CustoPorQualificado): CustoDescrito {
	if (custo.tipo === "valor") {
		return {
			texto: reais(custo.centavos),
			motivo: null,
			tooltip: "Investimento dividido pelos leads que chegaram ao estágio qualificado",
		};
	}
	return MOTIVOS[custo.motivo];
}
