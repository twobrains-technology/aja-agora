import { Bike, Car, Home as HomeIcon, Send } from "lucide-react";
import Image from "next/image";

import { SunBurst } from "@/components/kv/sun-burst";
import { Em } from "@/components/kv/em";

const KV = "/kv";

// Lettermark curto "AJA" (variante 'Curto — fundo escuro' do design system). Reaproveita
// os glifos A-J-A da parte superior do lockup oficial (src/components/brand/wordmark.tsx),
// recortados via viewBox. Segue currentColor (claro sobre o navy do badge/avatar).
function AjaMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="165 158 540 172"
			fill="currentColor"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="AJA"
			className={className}
		>
			<polygon points="215.29 323.78 275.58 214.54 335.47 323.78 382.3 323.78 294.76 166.11 255.64 166.11 168.87 323.78" />
			<path d="M456.44,163.77v60.32c0,33.62-27.35,60.97-60.97,60.97-7.1,0-13.89-1.28-20.21-3.55l-.35.35,23.13,41.67c53.7-1.38,96.99-45.4,96.99-99.44v-60.32h-38.6Z" />
			<polygon points="533.64 323.22 593.94 213.98 653.82 323.22 700.65 323.22 613.12 165.55 573.99 165.55 487.22 323.22" />
		</svg>
	);
}

// Hero (Figma frame 'Hero' 1440x873): duas colunas — bloco de texto + colagem de fotos
// (tríptico carro/moto/casa + sunburst coral atrás do recorte da consultora). Blob navy
// desfocado no canto inferior-esquerdo.
export function KvHero() {
	return (
		<section className="relative overflow-hidden bg-[#FAFAF3]">
			{/* Blob navy desfocado (Figma 'Blob' 720x757 @(-236,635)) */}
			<div className="pointer-events-none absolute -bottom-40 -left-40 size-[560px] rounded-full bg-[#021628] opacity-10 blur-[120px]" />

			<div className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-6 py-16 md:px-8 lg:grid-cols-[560px_1fr] lg:gap-[80px] lg:py-24">
				{/* Coluna de texto */}
				<div className="max-w-[560px]">
					<span className="inline-flex items-center gap-2 rounded-full bg-[#021628] py-1.5 pl-3.5 pr-4 text-[16px] font-semibold text-[#FAFAF3]">
						<AjaMark className="h-3 w-auto text-[#FAFAF3]" />
						Parceria independente para consórcio
					</span>

					<h1 className="mt-6 text-[40px] font-normal leading-[1.08] tracking-[-0.01em] text-[#021628] md:text-[56px] md:leading-[62px]">
						<Em>Compare</Em> consórcios
						<br />
						entre diversas
						<br />
						<Em>administradoras</Em>
					</h1>

					<p className="mt-6 max-w-[507px] text-[18px] leading-[1.35] text-[#2D2D2D] md:text-[22px] md:leading-[26px]">
						Comparar tudo isso sozinho leva tempo e aumenta a chance de uma escolha ruim.
						<br />A Aja reúne essas informações em um único lugar para{" "}
						<Em>facilitar sua decisão.</Em>
					</p>

					{/* Search card */}
					<div className="mt-8 max-w-[514px] rounded-[12px] bg-white px-6 pb-3 pt-3 shadow-[0_4px_16px_0_#00000014,0_12px_32px_-4px_#0000000A]">
						<div className="flex items-center gap-2.5 pt-1">
							<span className="flex size-[31px] items-center justify-center rounded-full bg-[#021628]">
								<AjaMark className="w-[18px] text-white" />
							</span>
							<span className="text-[18px] text-[#000]">Consultor independente</span>
						</div>
						<p className="mt-3 text-[18px] font-light text-[#6B6B66]">
							Quero um carro até R$ 80 Mil...
						</p>
						<div className="mt-4 flex items-center gap-3">
							{[
								{ icon: HomeIcon, label: "Imóvel" },
								{ icon: Car, label: "Carro" },
								{ icon: Bike, label: "Moto" },
							].map((chip) => (
								<span
									key={chip.label}
									className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#FBFBF9] px-3.5 py-1.5 text-[10px] font-semibold text-[#021628]"
								>
									<chip.icon className="size-3.5" strokeWidth={2} />
									{chip.label}
								</span>
							))}
							<button
								type="button"
								aria-label="Enviar"
								className="ml-auto flex size-[37px] items-center justify-center rounded-[6px] bg-[#FFE0E3] text-[#F2404F]"
							>
								<Send className="size-4" strokeWidth={2} />
							</button>
						</div>
					</div>

					{/* CTAs */}
					<div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
						<button
							type="button"
							className="inline-flex h-[52px] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[#F2404F] px-8 text-[16px] font-semibold text-white transition-[filter] hover:brightness-105"
						>
							Fale com a AJA
						</button>
						<button
							type="button"
							className="inline-flex h-[52px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#021628] px-8 text-[16px] font-semibold text-[#021628] transition-colors hover:bg-[#021628] hover:text-white"
						>
							Financiamento <Em className="mx-1">vs</Em> Consórcio
						</button>
					</div>
				</div>

				{/* Colagem de fotos */}
				<div className="relative mx-auto aspect-[617/615] w-full max-w-[560px]">
					{/* Tríptico de colunas ao fundo — carro · moto · casa (blueprint: 199/197/199
					    largura, x 0/210/418 em 617, altura 492/615 ≈ 80%). */}
					{[
						{
							src: "car-hero.jpg",
							left: "0%",
							pos: "object-center",
						},
						{ src: "moto-hero.jpg", left: "34%", pos: "object-center" },
						{
							src: "house-with-pool-house-background-1.jpg",
							left: "67.7%",
							pos: "object-[50%_42%]",
						},
					].map((col) => (
						<div
							key={col.src}
							className="absolute top-0 z-0 h-[70%] w-[32.3%] overflow-hidden rounded-[12px]"
							style={{ left: col.left }}
						>
							<Image
								src={`${KV}/${col.src}`}
								alt=""
								fill
								sizes="200px"
								className={`object-cover ${col.pos}`}
							/>
						</div>
					))}

					{/* Sunburst coral (Forma 04) — radial completo irradiando atrás da
					    consultora, centrado no torso (metade inferior da colagem). */}
					<SunBurst rays={13} arcSpan={230} arcStart={65} className="pointer-events-none absolute left-1/2 top-[63%] z-10 w-[96%] -translate-x-1/2 -translate-y-1/2" />
					{/* Recorte da consultora — elemento central dominante do key visual.
					    object-cover num recorte quase-retrato amplia e centraliza a
					    mulher, sobrepondo a metade inferior das fotos (como no Figma). */}
					<div className="absolute left-1/2 top-[8%] z-20 h-[70%] w-[58%] -translate-x-1/2 overflow-hidden">
						<Image
							src={`${KV}/woman-hero.png`}
							alt="Consultora da Aja Agora"
							fill
							sizes="440px"
							className="object-cover object-top"
						/>
					</div>
					{/* Balões de chat em escada (blueprint, coords no frame 581x555 @(28,60) →
					    percentuais da colagem 617x615). Palavra-chave em Merriweather serif bold
					    upright (<Em italic={false}>), corpo Poppins (branco) / Lato (azul). */}
					<span className="absolute left-[7%] top-[55%] z-30 whitespace-nowrap rounded-[6px] bg-white px-3.5 py-2 text-[13px] text-[#1D174F] shadow-[0_8px_20px_-8px_rgba(2,22,40,.4)] sm:text-[15px] lg:text-[18px]">
						Quero comprar um <Em italic={false}>imóvel</Em>. 🏠
					</span>
					<span className="absolute left-[31%] top-[64%] z-30 whitespace-nowrap rounded-[7px] bg-[#0E48B2] px-3.5 py-2 font-[family-name:var(--font-lato)] text-[13px] text-white shadow-[0_8px_20px_-8px_rgba(2,22,40,.4)] sm:text-[15px] lg:text-[18px]">
						Aqui estão as <Em italic={false}>opções</Em> de consórcio... 🎯
					</span>
					<span className="absolute left-[7%] top-[73%] z-30 whitespace-nowrap rounded-[6px] bg-white px-3.5 py-2 text-[13px] text-[#1D174F] shadow-[0_8px_20px_-8px_rgba(2,22,40,.4)] sm:text-[15px] lg:text-[18px]">
						Quero <Em italic={false}>simular</Em> as parcelas! 🗓️
					</span>
					<span className="absolute left-[27%] top-[82%] z-30 whitespace-nowrap rounded-[7px] bg-[#0E48B2] px-3.5 py-2 font-[family-name:var(--font-lato)] text-[13px] text-white shadow-[0_8px_20px_-8px_rgba(2,22,40,.4)] sm:text-[15px] lg:text-[18px]">
						Quer considerar um <Em italic={false}>lance</Em> embutido? 📢
					</span>
				</div>
			</div>
		</section>
	);
}
