import { Check, ChevronRight, Rocket, Trophy } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { Em } from "@/components/kv/em";
import { CARD_SHADOW, KvContainer } from "@/components/kv/ui/kv-container";
import { KvEyebrow } from "@/components/kv/ui/kv-eyebrow";
import { cn } from "@/lib/utils";

const KV = "/kv";

/** Glifo ">" da marca — path preenchido (fill), cantos vivos, sem stroke. */
function BrandChevron({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 34 55"
			className={cn("shrink-0", className)}
			role="presentation"
			aria-hidden="true"
		>
			<path fill="#F2404F" d="M0,0 L34,27.5 L0,55 L0,45 L24,27.5 L0,10 Z" />
		</svg>
	);
}

type Path = {
	icon: typeof Trophy;
	/** "navy" = label navy (card sorteio); "coral" = label coral (card lance). */
	tagStyle: "navy" | "coral";
	tag: string;
	/** Mobile: sem o "É a" (frame mobile-contemplacao). Node [181:...] tem quebra explícita no sorteio. */
	titleMobile: ReactNode;
	/** Desktop: com o "É a" (Left_Content_Col / Path_Lance). */
	titleDesktop: string;
	/** Mobile: node [181:216]/[181:200] — pode divergir do desktop (POR LANCE termina em "de contemplação."). */
	descriptionMobile: string;
	/** Desktop: node [160:904]/[160:934] — POR LANCE termina em "de ser contemplado.". */
	descriptionDesktop: string;
	/** Mobile: 2 tags (frame mobile). */
	benefitsMobile: string[];
	/** Desktop: 3 tags (frame desktop). */
	benefitsDesktop: string[];
};

const paths: Path[] = [
	{
		icon: Trophy,
		tagStyle: "navy",
		tag: "POR SORTEIO",
		titleMobile: (
			<>
				A chance que pode
				<br />
				te contemplar
			</>
		),
		titleDesktop: "É a chance que pode te contemplar",
		descriptionMobile:
			"Todos os meses são realizados sorteios entre os consorciados. É como um jogo da sorte dentro do seu plano. Basta estar com suas parcelas em dia.",
		descriptionDesktop:
			"Todos os meses são realizados sorteios entre os consorciados. É como um jogo da sorte dentro do seu plano. Basta estar com suas parcelas em dia.",
		benefitsMobile: ["Menor aporte", "Parcelas equilibradas"],
		benefitsDesktop: [
			"Menor aporte para iniciar",
			"Valores equilibrados",
			"Prazo integral do plano",
		],
	},
	{
		icon: Rocket,
		tagStyle: "coral",
		tag: "POR LANCE",
		titleMobile: "A estratégia para antecipar",
		titleDesktop: "É a estratégia que pode antecipar",
		descriptionMobile:
			"Ao oferecer um lance, você antecipa parcelas do seu plano e pode sair na frente. Funciona como um leilão inverso: quem oferece mais, tem maior chance de contemplação.",
		descriptionDesktop:
			"Ao oferecer um lance, você antecipa parcelas do seu plano e pode sair na frente. Funciona como um leilão inverso: quem oferece mais, tem maior chance de ser contemplado.",
		benefitsMobile: ["Você decide o momento", "Aceleração planejada"],
		benefitsDesktop: [
			"Você decide quando usar",
			"Sua oferta, suas regras",
			"Aceleração estratégica",
		],
	},
];

/**
 * Card de caminho (sorteio/lance). Duas linguagens cromáticas por breakpoint:
 * - Mobile (frame mobile-contemplacao): chip/pills coral sólido, texto navy, r:16.
 * - Desktop (Left_Content_Col/Path_Lance): chip/pills coral tint (~7% sobre
 *   branco), glyph navy, check coral, borda navy 2px, r:12.
 */
function PathCard({ path, className }: { path: Path; className?: string }) {
	const Icon = path.icon;

	return (
		<div
			className={cn(
				"rounded-[16px] bg-white p-6",
				CARD_SHADOW,
				"lg:rounded-[12px] lg:border-2 lg:border-[#052440] lg:p-8",
				className,
			)}
		>
			<div className="flex items-center gap-3 lg:gap-4">
				<span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#F2404F] lg:size-12 lg:rounded-[12px] lg:bg-[#F2404F]/[0.08]">
					<Icon className="size-5 text-white lg:size-6 lg:text-[#021628]" strokeWidth={2} />
				</span>
				<div>
					<p
						className={cn(
							"text-[10px] font-semibold uppercase leading-none lg:text-[12px]",
							path.tagStyle === "coral"
								? "text-[#F2404F]"
								: "text-[#021628] lg:font-[family-name:var(--font-manrope)] lg:font-bold",
						)}
					>
						{path.tag}
					</p>
					<p className="mt-0.5 text-[16px] font-semibold leading-none text-[#021628] lg:mt-1 lg:text-[22px] lg:leading-[1.1]">
						<span className="lg:hidden">{path.titleMobile}</span>
						<span className="hidden lg:inline">{path.titleDesktop}</span>
					</p>
				</div>
			</div>

			<p className="mt-4 text-[13px] leading-[20px] text-[#021628] lg:mt-6 lg:text-[16px] lg:leading-[2] lg:text-[#2D2D2D]">
				<span className="lg:hidden">{path.descriptionMobile}</span>
				<span className="hidden lg:inline">{path.descriptionDesktop}</span>
			</p>

			{/* Tags — mobile: 2, coral sólido, Poppins 11px */}
			<div className="mt-4 flex flex-wrap gap-2 lg:hidden">
				{path.benefitsMobile.map((label) => (
					<span
						key={label}
						className="inline-flex items-center gap-1 rounded-[6px] bg-[#F2404F] px-2.5 py-1 text-[11px] leading-none text-[#021628]"
					>
						<Check className="size-3 shrink-0 text-[#021628]" strokeWidth={2.5} />
						{label}
					</span>
				))}
			</div>

			{/* Tags — desktop: 3, coral tint, Manrope 16px, check coral */}
			<div className="mt-6 hidden flex-wrap gap-3 lg:flex">
				{path.benefitsDesktop.map((label) => (
					<span
						key={label}
						className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#F2404F]/[0.07] px-3 py-1.5 font-[family-name:var(--font-manrope)] text-[16px] leading-none text-[#021628]"
					>
						<Check className="size-3 shrink-0 text-[#F2404F]" strokeWidth={2.5} />
						{label}
					</span>
				))}
			</div>
		</div>
	);
}

// Seção "Momento da contemplação".
// Mobile (frame mobile-contemplacao): coluna única foto → header → 2 cards → card navy.
// Desktop (Left_Content_Col + Group 134 + Path_Lance): colagem assimétrica —
// header + card sorteio à esquerda, foto retrato à direita, card lance flutuando
// sobreposto à foto e à base do card sorteio; o bloco "Diferencial" (chevron +
// texto) fica ancorado na base da seção, abaixo da linha do card lance.
export function KvContemplacao() {
	return (
		<section className="relative overflow-hidden bg-[#FAFAF3]">
			{/* Blob coral desfocado atrás do header/1º card (mobile + tablet, até o breakpoint em que a colagem desktop assume) */}
			<div className="pointer-events-none absolute left-[43%] top-[357px] size-[300px] -translate-x-1/2 rounded-full bg-[#FFE0E3] opacity-70 blur-[100px] xl:hidden" />

			<KvContainer className="max-w-[1240px] px-5 pb-16 pt-2 md:px-8 lg:py-24">
				{/* Colagem absoluta (foto + card "Por Lance" flutuando) só cabe fiel ao
				    Figma a partir de xl (1280px) — entre 1024-1279px ela vazava (card
				    passava da borda, foto sobrepunha o texto). Abaixo de xl mantém o
				    empilhamento vertical, que já é responsivo. */}
				<div className="relative xl:min-h-[880px]">
					{/* Grafismos corais diagonais de fundo (só desktop) */}
					<svg
						className="pointer-events-none absolute left-[-150px] top-0 z-0 hidden h-full w-[560px] xl:block"
						viewBox="0 0 560 880"
						preserveAspectRatio="xMinYMin slice"
						role="presentation"
						aria-hidden="true"
					>
						{/* Banda diagonal principal — desce da direita-alto pra esquerda-baixo,
							    poka à esquerda do card e some no canto inferior-esquerdo. */}
						<path fill="#F2404F" d="M200,270 L370,350 L170,880 L0,880 L0,760 Z" />
						{/* Triângulo superior-esquerdo, alinhado ao topo do card sorteio. */}
						<path fill="#F2404F" d="M70,210 L130,210 L70,340 Z" />
					</svg>

					<div className="relative z-10 lg:max-w-[633px]">
						{/* Foto — topo no mobile; no desktop vive na direita (abaixo).
						    Crop do Figma (blueprint mobile-full): imagem 670x447 @(-304,-47)
						    numa máscara 291x278 → mostra a faixa central/direita (casal+cachorro),
						    corretora quase fora do quadro. Reproduzido via imagem sobredimensionada
						    (230% da largura do container) + offset absoluto, não object-position. */}
						<div className="relative mx-auto mb-3 mt-[39px] aspect-[291/278] w-full max-w-[291px] overflow-hidden rounded-[9px] xl:mt-0 xl:hidden">
							<Image
								src={`${KV}/happy-couple-with-dog-shaking-hands-with-real-es.jpg`}
								alt="Casal feliz apertando a mão de corretor após ser contemplado"
								width={670}
								height={447}
								sizes="291px"
								className="absolute left-[-104.5%] top-[-16.9%] h-auto w-[230%] max-w-none"
							/>
						</div>

						<KvEyebrow className="text-[11px] tracking-[0.18em] lg:text-[12px]">
							COMO FUNCIONA
						</KvEyebrow>
						<h2 className="mt-3 text-[28px] font-normal leading-[36px] text-[#021628] lg:mt-4 lg:text-[44px] lg:leading-[1]">
							Momento da <Em>contemplação</Em>
						</h2>
						<p className="mt-3 max-w-[540px] text-[14px] leading-[22px] text-[#021628] lg:mt-4 lg:max-w-[633px] lg:text-[16px] lg:leading-[2] lg:text-[#2D2D2D]">
							<span className="lg:font-semibold">Existem duas formas</span> principais de ser
							contemplado em um consórcio. Você escolhe a estratégia que faz mais sentido para o seu
							momento.
						</p>
					</div>

					{/* Foto retrato — só desktop, ancorada à direita. Altura dominante (aspect-ratio
					    638/814 calcula a largura) pra ficar grande o bastante do card Por Lance
					    caber CONTIDO sobre ela, como no Figma (foto desce além da base do card). */}
					<div className="absolute right-0 top-0 z-0 hidden aspect-[638/814] h-[700px] overflow-hidden rounded-[12px] xl:block">
						<Image
							src={`${KV}/happy-couple-with-dog-shaking-hands-with-real-es.jpg`}
							alt="Casal feliz apertando a mão de corretor após ser contemplado"
							fill
							sizes="(min-width: 1280px) 549px, 100vw"
							className="object-cover object-[68%_center]"
						/>
					</div>

					{/* Cards de caminho: sorteio (sempre no fluxo, define a altura do wrapper) +
					    lance. No mobile os dois empilham; no desktop o sorteio fica na coluna esq
					    (capado a 580, como o Figma) e o lance flutua ancorado 262px abaixo do topo
					    do sorteio, com a borda esquerda invadindo só a área vazia abaixo das tags —
					    nenhum texto do sorteio fica oculto. */}
					<div className="relative z-10 mt-8 xl:mt-10 xl:max-w-[580px]">
						<PathCard path={paths[0]} />

						<PathCard
							path={paths[1]}
							className="mt-6 xl:absolute xl:left-[404px] xl:top-[262px] xl:z-20 xl:mt-0 xl:w-[580px]"
						/>
					</div>

					{/* Diferencial — texto plano com chevron coral, base da seção (só desktop) */}
					<div className="hidden items-start gap-3 xl:absolute xl:bottom-0 xl:left-0 xl:flex xl:pl-[140px]">
						<BrandChevron className="h-[52px] w-auto self-start" />
						<div>
							<KvEyebrow className="text-[13px] leading-normal">
								Diferencial da nossa plataforma
							</KvEyebrow>
							<p className="mt-1 max-w-[340px] text-[16px] font-medium leading-6 text-[#021628]">
								Aja Agora te mostra o <Em>lance médio</Em> dos clientes para contemplação rápida.
							</p>
						</div>
					</div>

					{/* Diferencial — card navy (mobile + tablet, até xl assumir a colagem desktop) */}
					<div className="mt-8 rounded-[14px] bg-[#021628] p-5 xl:hidden">
						<div className="flex items-center gap-2">
							<ChevronRight className="size-3 shrink-0 text-[#F2404F]" strokeWidth={2.5} />
							<KvEyebrow className="text-[11px]">DIFERENCIAL DA PLATAFORMA</KvEyebrow>
						</div>
						<p className="mt-3 max-w-[340px] text-[14px] font-medium leading-[20px] text-[#FAFAF3]">
							Aja Agora te mostra o lance médio
							<br />
							dos consorciados para contemplação acelerada.
						</p>
					</div>
				</div>
			</KvContainer>
		</section>
	);
}
