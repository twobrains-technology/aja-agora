import { AjaMark } from "@/components/brand/aja-mark";
import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";

/**
 * A dobra que recebeu a frase que saiu da pílula do hero (pedido do cliente,
 * 2026-08-20).
 *
 * No mobile, "o jeito independente de escolher consórcio" vinha num selo navy
 * arredondado logo acima da manchete — e parecia um botão, disputando o toque
 * com os CTAs de verdade que vêm logo abaixo. A frase é boa; o lugar e a forma
 * é que estavam errados.
 *
 * Aqui ela é o oposto disso: **não tem nada clicável**, fica no fim da página e
 * é composta como assinatura de marca (lettermark + Merriweather itálico), onde
 * ninguém a confunde com uma ação.
 *
 * `md:hidden` porque no desktop a pílula continua no hero, onde o comp do Figma
 * a colocou e onde ela nunca competiu com nada — o topo lá é largo o bastante.
 *
 * Renderizada por `<KvFooter/>`, entre o "Busque a melhor alternativa" e a faixa
 * navy. Sem respiro no topo: o bloco do CTA final acima já fecha com `pb-12`
 * (`KV_RITMO.rodape`), e somar o nosso por cima abriria um vão de 72px no meio
 * do fim da página.
 */
export function KvIndependente() {
	return (
		<section className="bg-[#FAFAF3] pb-8 pt-0 md:hidden">
			<KvContainer className="flex flex-col items-center gap-4 text-center">
				<div className="h-px w-16 bg-[#021628]/15" />
				<AjaMark className="h-4 w-auto text-[#021628]" />
				<p className="max-w-[300px] text-[20px] leading-[1.25] text-[#021628]">
					O jeito <Em>independente</Em> de escolher consórcio
				</p>
			</KvContainer>
		</section>
	);
}
