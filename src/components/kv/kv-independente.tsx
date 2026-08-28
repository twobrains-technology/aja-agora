"use client";

import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";

/**
 * A dobra que recebeu a frase que saiu da pílula do hero (pedido do cliente,
 * 2026-08-20).
 *
 * No mobile, "o jeito independente de escolher consórcio" vinha num selo navy
 * arredondado logo acima da manchete — e parecia um botão, disputando o toque
 * com os CTAs de verdade que vêm logo abaixo. A frase é boa; o lugar e a forma
 * é que estavam errados.
 *
 * Aqui ela é o oposto disso: a FRASE não é clicável, fica no fim da página e é
 * composta em Merriweather itálico, onde ninguém a confunde com uma ação.
 *
 * A linha divisória e o lettermark da AJA que acompanhavam a frase saíram em
 * 28/08 (pedido do Kairo). A assinatura já é o wordmark da faixa navy logo
 * abaixo — repetir a marca duas vezes em ~100px é a mesma repetição que tirou
 * daqui a segunda cópia da frase, alguns parágrafos adiante.
 *
 * Renderizada por `<KvFooter/>`, entre a comparação e a faixa navy. Sem respiro
 * no topo: quem fecha o vão é a base da seção acima (`KV_RITMO.comparacao`,
 * `pb-8 md:pb-[61px]`), e somar o nosso por cima abriria um buraco no meio do
 * fim da página. No Figma 731:6575 são 56px entre o último item da comparação e
 * esta faixa, e 52px daqui até o navy — os `md:pb-12` de baixo.
 *
 * É o ÚNICO lugar onde a frase aparece. Ela também vivia embaixo do wordmark,
 * dentro da faixa navy; com esta faixa logo acima seria a mesma frase duas
 * vezes em ~100px, então a de lá saiu.
 *
 * **O que mudou em 28/08 (Figma 731:6575, comentário #145 "ajustei cta final"):**
 * a faixa passou a fechar a página COM um CTA, e o bloco "Busque a melhor
 * alternativa" — headline + "Fale com a AJA" + "Encontre o consórcio certo" —
 * saiu do rodapé. Três chamadas coladas no fim viravam a mesma escolha
 * oferecida três vezes; agora é uma.
 *
 * Isso não contradiz o parágrafo acima: o que não podia parecer clicável é a
 * FRASE, e ela continua sendo texto. O botão é um alvo separado, abaixo dela e
 * com forma de botão — ninguém precisa adivinhar onde tocar.
 *
 * `onOpenChat` é opcional porque este mesmo bloco serve as páginas de
 * conformidade (política, termos, 404), onde o `KvFooter` não passa nada: lá a
 * faixa é só assinatura de marca. Sem a função, o botão não existe — não dá
 * para renderizar um CTA morto por engano.
 */
interface KvIndependenteProps {
	onOpenChat?: TheaterOpener;
}

export function KvIndependente({ onOpenChat }: KvIndependenteProps) {
	return (
		<section className="bg-[#FAFAF3] pb-8 pt-0 md:pb-12">
			<KvContainer className="flex flex-col items-center gap-4 text-center md:gap-5">
				<p className="max-w-[300px] text-[20px] leading-[1.25] text-[#021628] md:max-w-none md:text-[28px]">
					O jeito <Em>independente</Em> de escolher consórcio
				</p>
				{onOpenChat ? (
					<KvCtaButton
						onClick={(e) => onOpenChat("", e.currentTarget)}
						className="mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2404F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF3]"
					>
						Comparar agora
					</KvCtaButton>
				) : null}
			</KvContainer>
		</section>
	);
}
