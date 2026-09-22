// Portão do VALOR do fecho (L2) — o valor do contrato é o valor que o cliente VIU.
//
// Produção, 21/09/2026: o cliente pediu e viu uma simulação de R$ 80.000; no fecho
// o agente disse "esse grupo trabalha com a carta nominal de R$ 120.000, então a
// simulação fechou nesse valor". Duas coisas erradas de uma vez — (a) afirmar que a
// simulação fechou num número que ela nunca mostrou e (b) trocar o objeto do
// contrato sem confirmação.
//
// A âncora é o VALOR (fato de servidor), nunca a fala. Este módulo é a fonte única
// do julgamento e existe separado de `fulfillment.ts` de propósito: quem monta a
// copy do fecho (`closing-presentation.ts`) o consome junto, e testes que trocam o
// `fulfillment` por um dublê não podem derrubar a apresentação por causa disso.

import { MAX_CREDIT_DEVIATION } from "../adapters/bevi/partner-offer-mapper";

/** A carta REAL que a administradora devolveu difere do valor que o cliente VIU?
 *
 * O fecho não pode registrar/contratar em silêncio uma carta com valor diferente
 * do que o cliente aprovou. A divergência é legítima — o grupo que a administradora
 * libera no fechamento nem sempre é o simulado —, mas tem que virar CONFIRMAÇÃO
 * explícita ANTES do contrato, nunca surpresa no resumo.
 *
 * A tolerância é a MESMA do matching (`MAX_CREDIT_DEVIATION`, FIX-419): o grupo
 * real quase nunca bate o número redondo, e um desvio pequeno é ruído de catálogo,
 * não troca de objeto. Sem os DOIS lados (valor visto e oferta real) não há
 * divergência a afirmar — nunca inventa (D11). */
export function valorDoFechoDivergiu(
	valorVisto: number | null | undefined,
	ofertaReal: number | null | undefined,
	tolerancia: number = MAX_CREDIT_DEVIATION,
): boolean {
	const visto = typeof valorVisto === "number" && Number.isFinite(valorVisto) ? valorVisto : null;
	const real = typeof ofertaReal === "number" && Number.isFinite(ofertaReal) ? ofertaReal : null;
	if (visto === null || visto <= 0 || real === null || real <= 0) return false;
	return Math.abs(real - visto) / visto > tolerancia;
}
