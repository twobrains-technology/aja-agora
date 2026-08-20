import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Respiro vertical de cada seção da landing.
 *
 * **Não é uniforme, e isso é de propósito.** Cada seção tem o seu no comp, e
 * forçar um valor único deixa o fim da página arejado demais: entre Confiança e
 * Comparação o comp abre 58px, entre Comparação e rodapé 61px, contra os ~200px
 * do miolo. Uniformizar em 192px inchava a home em ~380px.
 *
 * Os valores de `md:` saem medidos do frame 'Home Page AJA' (1440x8845, arquivo
 * KORSVsutxrH4f1W5Osc6sn nó 1-167): para cada seção, a distância entre a borda
 * da caixa e o primeiro/último nó de texto. O vão que se enxerga entre duas
 * seções é a soma — base de uma + topo da seguinte:
 *
 * | transição              | comp  |
 * |------------------------|-------|
 * | Menu → Hero            | 183px |
 * | Hero → Jornada         | 213px |
 * | Jornada → Tipos        | 200px |
 * | Tipos → Contemplação   | 180px |
 * | Contemplação → FAQ     | 147px |
 * | FAQ → Números          | 281px |
 * | Números → Depoimentos  | 236px | (55 + marquee 66 + 115)
 * | Depoimentos → Confiança| 122px |
 * | Confiança → Comparação |  78px | (base do painel navy → eyebrow)
 * | Comparação → Rodapé    |  61px |
 *
 * O comp só existe em 1440px. Os valores base (mobile) são os do comp reduzidos
 * a ~55% e arredondados na escala do Tailwind — proporção, não medida.
 */
export const KV_RITMO = {
	/** Encosta no menu, não em outra seção: 144px é o que o comp abre até o badge.
	 *
	 * O respiro do CELULAR encolheu em 20/08/2026 (pedido do Kairo): 48 → 28px no
	 * topo e 56 → 40px na base. A primeira dobra é a única que compete com a
	 * altura da tela — o que estiver abaixo do vão só existe depois de uma
	 * rolagem —, e a barra acima também ficou 40% mais baixa no mesmo pedido:
	 * manter o vão antigo devolveria, em espaço vazio, o que a barra economizou.
	 * O desktop segue o comp. */
	hero: "pt-7 pb-10 md:pt-36 md:pb-[151px]",
	jornada: "pt-8 pb-12 md:pt-[62px] md:pb-[92px]",
	/** 85 e não 108: a serpentina da jornada acima já desce além do último texto. */
	tipos: "pt-11 pb-16 md:pt-[85px] md:pb-[119px]",
	contemplacao: "pt-8 pb-8 md:pt-[61px] md:pb-[67px]",
	/** A base de 180px é a maior da página — o comp separa bem o FAQ dos números. */
	faq: "pt-10 pb-24 md:pt-20 md:pb-[180px]",
	/**
	 * A transição Números → Depoimentos é a única partida em dois, porque o
	 * marquee coral (66px de altura própria) fica entre as duas seções. O comp
	 * mede: 55px da "Fonte: ABAC" até o topo da faixa, os 66px da faixa, e 115px
	 * da base dela até o eyebrow dos depoimentos.
	 */
	numeros: "pt-12 pb-8 md:pt-[101px] md:pb-[55px]",
	depoimentos: "pt-16 pb-11 md:pt-[115px] md:pb-[85px]",
	/** Topo zerado e base zerada: o painel navy interno já traz os ~56px de respiro
	 *  que o comp conta como parte do vão. Somar o do comp por cima dobrava a conta. */
	confianca: "pt-0 pb-0 md:pt-0 md:pb-0",
	/**
	 * 60px de topo: no comp o painel navy do Confiança acaba em 7484 e o eyebrow
	 * "COMO FUNCIONA" começa em 7562 — 78px de vão, dos quais 4 já vêm da
	 * estrutura interna. Não confundir com a caixa do grupo Confiança, que vai
	 * até 7600 só por causa de um blob decorativo fora da tela.
	 */
	comparacao: "pt-10 pb-8 md:pt-[74px] md:pb-[61px]",
	/** Sem topo: o comp encosta o "Busque a melhor alternativa" na borda da seção. */
	rodape: "pt-0 pb-12 md:pb-[88px]",
} as const;

type KvSectionProps = HTMLAttributes<HTMLElement> & {
	/** Respiro da seção — sempre uma entrada de `KV_RITMO`, nunca um valor solto. */
	rhythm: string;
};

/**
 * `<section>` da landing com o respiro vertical já resolvido. A largura máxima e
 * o gutter continuam sendo do `KvContainer` de dentro, que hoje é o mesmo em
 * toda seção de conteúdo.
 */
export function KvSection({ className, rhythm, ...props }: KvSectionProps) {
	return <section className={cn("relative", rhythm, className)} {...props} />;
}
