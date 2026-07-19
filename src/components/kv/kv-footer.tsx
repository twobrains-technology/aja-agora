import type { SVGProps } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";

// Ícones de marca (o lucide-react do projeto não exporta social icons por
// questão de trademark). SVGs inline, currentColor.
function InstagramIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<rect x="2" y="2" width="20" height="20" rx="5" />
			<circle cx="12" cy="12" r="4" />
			<circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
		</svg>
	);
}
function FacebookIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path d="M14 9h3V5h-3c-2.2 0-4 1.8-4 4v2H7v4h3v6h4v-6h3l1-4h-4V9c0-.6.4-1 1-1z" />
		</svg>
	);
}
function LinkedInIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path d="M6.94 5A1.94 1.94 0 1 1 3 5a1.94 1.94 0 0 1 3.94 0zM3.5 8.5h3v12h-3v-12zm5 0h2.87v1.64h.04c.4-.76 1.38-1.56 2.84-1.56 3.04 0 3.6 2 3.6 4.6v7.32h-3v-6.49c0-1.55-.03-3.54-2.16-3.54-2.16 0-2.49 1.69-2.49 3.43v6.6h-3v-12z" />
		</svg>
	);
}
function YouTubeIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<path d="M22.5 7.2a2.7 2.7 0 0 0-1.9-1.9C18.9 4.8 12 4.8 12 4.8s-6.9 0-8.6.5A2.7 2.7 0 0 0 1.5 7.2C1 8.9 1 12 1 12s0 3.1.5 4.8a2.7 2.7 0 0 0 1.9 1.9c1.7.5 8.6.5 8.6.5s6.9 0 8.6-.5a2.7 2.7 0 0 0 1.9-1.9c.5-1.7.5-4.8.5-4.8s0-3.1-.5-4.8zM9.8 15.3V8.7l5.7 3.3-5.7 3.3z" />
		</svg>
	);
}

const NAV_LINKS = [
	{ label: "Consórcio vs financiamento", href: "#" },
	{ label: "Como funcionamos", href: "#" },
	{ label: "Tipo de Consórcio", href: "#" },
];

const RESOURCE_LINKS = [
	{ label: "Dúvidas", href: "#" },
	{ label: "Jornada", href: "#" },
	{ label: "Blog", href: "#" },
];

type FooterLink = { label: string; href: string };

// Coluna de links do rodapé (título uppercase + lista) — Navegação e Recursos
// têm a mesma estrutura, só o array de links e o aria-label mudam.
function FooterLinkColumn({ title, links }: { title: string; links: FooterLink[] }) {
	return (
		<nav aria-label={title} className="lg:w-[226px]">
			<h3 className="text-[12px] font-semibold uppercase leading-none tracking-wide text-[#F2F2F2]/60">
				{title}
			</h3>
			<ul className="mt-[10px] flex flex-col gap-[10px]">
				{links.map((link) => (
					<li key={link.label}>
						<a
							href={link.href}
							className="text-[14px] leading-none text-[#F2F2F2] transition-colors hover:text-white"
						>
							{link.label}
						</a>
					</li>
				))}
			</ul>
		</nav>
	);
}

// TODO: URL real das redes sociais da Aja Agora — placeholder até o operador
// confirmar os perfis (FIX-353).
const SOCIALS = [
	{ icon: InstagramIcon, label: "Instagram", href: "#" },
	{ icon: FacebookIcon, label: "Facebook", href: "#" },
	{ icon: LinkedInIcon, label: "LinkedIn", href: "#" },
	{ icon: YouTubeIcon, label: "YouTube", href: "#" },
];

interface KvFooterProps {
	onOpenChat: TheaterOpener;
}

// Frame 'CTA Final + Footer' (1440x615): CTA sobre fundo claro (headline +
// 2 botões) seguido do rodapé navy (marca, navegação, contato, redes sociais
// e linha legal). Todo o bloco é o landmark <footer> da página.
export function KvFooter({ onOpenChat }: KvFooterProps) {
	return (
		<footer className="bg-[#FAFAF3]">
			{/* CTA Final */}
			<KvContainer className="flex max-w-[1240px] flex-col gap-8 pb-12 pt-8 md:pb-16 md:pt-4 lg:flex-row lg:items-center lg:justify-between lg:px-0">
				<h2 className="max-w-[815px] font-[family-name:var(--font-merriweather)] text-[32px] font-normal leading-[1.2] text-[#021628] md:text-[44px] md:leading-[62px]">
					Busque a melhor <Em>alternativa</Em>
				</h2>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
					<KvCtaButton
						onClick={(e) => onOpenChat("", e.currentTarget)}
						className="focus-visible:ring-2 focus-visible:ring-[#F2404F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF3] focus-visible:outline-none"
					>
						Fale com a AJA
					</KvCtaButton>
					<KvCtaButton
						variant="outline"
						onClick={(e) => onOpenChat("", e.currentTarget)}
						className="border-2 hover:bg-transparent hover:text-[#F2404F] focus-visible:ring-2 focus-visible:ring-[#021628] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF3] focus-visible:outline-none"
					>
						Escolha o seu consórcio
					</KvCtaButton>
				</div>
			</KvContainer>

			{/* Footer */}
			<div className="bg-[#021628] px-6 pb-8 pt-12 text-[#F2F2F2] md:px-16 lg:pb-[191px]">
				<div className="mx-auto flex max-w-[1316px] flex-col gap-6">
					<div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
						{/* Marca */}
						<div className="flex flex-col items-start gap-3 lg:w-[360px]">
							<Wordmark className="h-[58px] w-auto text-[#F2F2F2]" />
							<p className="text-[14px] leading-[2] text-[#F2F2F2]">
								Consultoria de consórcio independente
							</p>
						</div>

						{/* Navegação + Recursos */}
						<div className="flex flex-col gap-10 sm:flex-row sm:gap-12 lg:w-[500px]">
							<FooterLinkColumn title="Navegação" links={NAV_LINKS} />
							<FooterLinkColumn title="Recursos" links={RESOURCE_LINKS} />
						</div>

						{/* Contato */}
						<div className="lg:w-[360px]">
							<h3 className="text-[12px] font-semibold uppercase leading-none tracking-wide text-[#F2F2F2]/60">
								Contato
							</h3>
							<div className="mt-[10px] flex flex-col gap-[10px]">
								<a
									href="mailto:contato@aja.com.br"
									className="text-[14px] leading-none text-[#F2F2F2] transition-colors hover:text-white"
								>
									contato@aja.com.br
								</a>
								<a
									href="tel:+551100000000"
									className="text-[14px] leading-none text-[#F2F2F2] transition-colors hover:text-white"
								>
									+55 (11) 0000-0000
								</a>
							</div>
						</div>
					</div>

					{/* Redes sociais */}
					<div className="flex items-center gap-4">
						{SOCIALS.map((social) => (
							<a
								key={social.label}
								href={social.href}
								aria-label={social.label}
								className="flex size-10 items-center justify-center rounded-full border border-white/40 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#021628]"
							>
								<social.icon className="size-[18px]" strokeWidth={2} />
							</a>
						))}
					</div>

					{/* Linha legal */}
					<div className="flex flex-col gap-4">
						<div className="h-px w-full bg-[#F2F2F2]" />
						<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-[12px] leading-none text-[#F2F2F2]">
								© 2026 AJA AGORA. Todos os direitos reservados.
							</p>
							<div className="flex items-center gap-4">
								<a
									href="/politica-de-privacidade"
									className="text-[12px] leading-none text-[#F2F2F2] transition-colors hover:text-white"
								>
									Política de Privacidade
								</a>
								<a
									href="/termos-de-uso"
									className="text-[12px] leading-none text-[#F2F2F2] transition-colors hover:text-white"
								>
									Termos de Uso
								</a>
							</div>
						</div>
					</div>
				</div>
			</div>
		</footer>
	);
}
