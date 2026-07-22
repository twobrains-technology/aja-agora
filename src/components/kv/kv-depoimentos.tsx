import { Quote, Star } from "lucide-react";
import Image from "next/image";

import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { CARD_SHADOW, KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";

const KV = "/kv";

type Testimonial = {
	quote: string;
	name: string;
	meta: string;
	avatar: string;
};

const testimonials: Testimonial[] = [
	{
		quote:
			"Sempre tive receio de contratar um consórcio sem saber se estava fazendo a melhor escolha, ainda mais se tratando de um imóvel.\nNa AJA foi diferente: eles compararam várias administradoras, explicaram tudo com clareza\ne encontraram um grupo ideal para o meu perfil. Hoje estou realizando o sonho do meu primeiro imóvel com tranquilidade e confiança.”",
		name: "Bruna Perrotta",
		meta: "Imóvel em São Paulo - SP",
		avatar: "avatar-image-2.png",
	},
	{
		quote:
			"Ter um carro novo era um objetivo importante para minha família. Na AJA encontrei muito mais do que um consórcio: encontrei orientação, transparência e a segurança de saber que escolheram a melhor opção\npara mim entre várias administradoras.\nRecomendo de olhos fechados.",
		name: "Bernardo Canedo",
		meta: "Automóvel em Curitiba - PR",
		avatar: "avatar-image.png",
	},
	{
		quote:
			"Eu queria comprar uma moto e a Aja entendeu o que eu precisava!! Deu para perceber que eles respeitam o meu dinheiro, são imparciais, tanto faz o consórcio que eu fechei! Mas, o escolhido foi analisado e recomendado exclusivamente para mim! E não paguei nada a mais por isso!!!",
		name: "Eduardo Leite",
		meta: "Moto em Belo Horizonte - MG",
		avatar: "avatar-image-3.png",
	},
];

interface KvDepoimentosProps {
	onOpenChat: TheaterOpener;
}

// Seção "Depoimentos" (Figma: Group 122 / depoimentos-section). Header centralizado +
// grid de 3 cards de depoimento + bloco de CTA final.
export function KvDepoimentos({ onOpenChat }: KvDepoimentosProps) {
	return (
		<section className="relative overflow-hidden bg-[#FAFAF3]">
			{/* Blob decorativo desfocado (Figma: 450x450 @(-200,150), opacity .6, blur 150) */}
			<div className="pointer-events-none absolute -left-[200px] top-[150px] size-[450px] rounded-full bg-[#FFE0E3] opacity-60 blur-[150px]" />

			<KvContainer className="max-w-[1440px] py-6 md:px-20 md:py-8">
				{/* Header */}
				<div className="text-center">
					<KvEyebrow>CONFIANÇA E RESULTADO</KvEyebrow>
					<h2 className="mt-4 text-[32px] font-normal leading-[1.2] text-[#021628] md:text-[44px] md:leading-[53px]">
						Quem planeja com a AJA<Em>, conquista</Em>
					</h2>
					<p className="mx-auto mt-4 max-w-[749px] text-[16px] leading-[26px] text-[#6B6B66]">
						Veja o depoimento de clientes reais que compararam as melhores alternativas do mercado
						de consórcios e tomaram a decisão ideal para suas vidas financeiras.
					</p>
				</div>

				{/* Grid de depoimentos */}
				<div className="mt-10 grid grid-cols-1 gap-8 md:mt-[38px] md:grid-cols-3">
					{testimonials.map((testimonial) => (
						<div
							key={testimonial.name}
							className={`flex min-h-[380px] flex-col rounded-[16px] bg-white p-8 ${CARD_SHADOW}`}
						>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1">
									{["s1", "s2", "s3", "s4", "s5"].map((star) => (
										<Star
											key={star}
											className="size-[18px] fill-none text-[#F2404F]"
											strokeWidth={2}
										/>
									))}
								</div>
								<Quote className="size-8 text-[#FFE0E3]" strokeWidth={1.5} />
							</div>

							<p className="mt-4 whitespace-pre-line font-[family-name:var(--font-merriweather)] text-[14px] leading-normal text-[#2D2D2D]">
								{testimonial.quote}
							</p>

							<div className="mt-auto flex items-center gap-4 border-t border-[#FFE0E3] pt-8">
								<div className="relative size-14 shrink-0 overflow-hidden rounded-full">
									<Image
										src={`${KV}/${testimonial.avatar}`}
										alt={`Retrato de ${testimonial.name}`}
										fill
										sizes="56px"
										className="object-cover"
									/>
								</div>
								<div className="min-w-0">
									<p className="text-[18px] font-bold leading-[1.2] text-[#021628]">
										{testimonial.name}
									</p>
									<p className="mt-1 text-[14px] font-medium leading-[1.2] text-[#6B6B66]">
										{testimonial.meta}
									</p>
								</div>
							</div>
						</div>
					))}
				</div>

				{/* CTA final */}
				<div className="mt-10 flex flex-col items-center gap-6 text-center md:mt-12">
					<p className="text-[24px] font-normal text-[#021628] md:text-[32px]">
						Quer ser o próximo a realizar o <Em w="black">seu sonho?</Em>
					</p>
					<KvCtaButton onClick={(e) => onOpenChat("", e.currentTarget)}>Fale com a AJA</KvCtaButton>
				</div>
			</KvContainer>
		</section>
	);
}
