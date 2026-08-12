import type { SVGProps } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { Em } from "@/components/kv/em";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";
import { KV_RITMO } from "@/components/kv/ui/kv-section";

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

const NAV_LINKS = [
	{ label: "Encontre o consórcio certo", href: "#" },
	{ label: "Como funcionamos", href: "#" },
	{ label: "Tipo de Consórcio", href: "#" },
];

// Sem "Blog": o comp atualizado deixou Recursos com dois itens, e não há blog
// publicado para onde apontar.
const RESOURCE_LINKS = [
	{ label: "Dúvidas", href: "#" },
	{ label: "Jornada", href: "#" },
];

/**
 * Letras miúdas do rodapé. Razão social, CNPJ e endereço são exigência de
 * identificação de quem opera o site — texto do comp, palavra por palavra, com
 * "consorcio" acentuado.
 */
const LETRAS_MIUDAS = [
	"© 2026 AJA. Todos os direitos reservados.",
	"A AJA é o nome comercial de Labre Assessoria e Consultoria Empresarial Ltda, inscrita no CNPJ 64.975.074/0001-26, com sede em São Paulo - SP, na Avenida Paulista, 1471, conj. 511 - Bela Vista, CEP 01311-927. Consulte nossos canais de atendimento acima para falar por WhatsApp ou telefone.",
	"Ao utilizar este site, você concorda com nossos termos de uso e política de privacidade.",
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
];

interface KvFooterProps {
	onOpenChat: TheaterOpener;
	/** Sem o bloco "Busque a melhor alternativa" — só a faixa navy. */
	comCtaFinal?: boolean;
}

// Frame 'CTA Final + Footer' (1440x615): CTA sobre fundo claro (headline +
// 2 botões) seguido do rodapé navy (marca, navegação, contato, redes sociais
// e linha legal). Todo o bloco é o landmark <footer> da página.
//
// `comCtaFinal` existe porque as páginas de conformidade (política de
// privacidade e 404) trazem só a parte navy: nos frames 625:4545 e 625:4639 o
// filho é o `Footer - AJA` puro, sem o "Busque a melhor alternativa". Faz
// sentido — quem caiu num 404 ou foi ler a política não está no fim de um funil
// de venda para levar uma chamada de conversão na cara.
export function KvFooter({ onOpenChat, comCtaFinal = true }: KvFooterProps) {
	return (
		<footer className="bg-[#FAFAF3]">
			{comCtaFinal ? (
				<KvContainer
					className={`flex flex-col gap-8 ${KV_RITMO.rodape} lg:flex-row lg:items-center lg:justify-between`}
				>
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
							Encontre o consórcio certo
						</KvCtaButton>
					</div>
				</KvContainer>
			) : null}

			{/* Footer */}
			{/* Respiros do comp: 64px em cima, 64px nas laterais e 36px abaixo dos
			    links. Os 191px que havia embaixo vinham de medir o rodapé no frame
			    da home, onde ele transborda a moldura e não dá para ler a base —
			    'politica-de-privacidade' e 'pagina-404' contêm o rodapé inteiro
			    (495px) e concordam entre si. */}
			<div className="bg-[#021628] px-6 pb-9 pt-16 text-[#F2F2F2] md:px-16">
				<div className="mx-auto flex max-w-[1316px] flex-col gap-6">
					<div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
						{/* Marca */}
						<div className="flex flex-col items-start gap-3 lg:w-[360px]">
							<Wordmark className="h-[58px] w-auto text-[#F2F2F2]" />
							<p className="text-[14px] leading-[2] text-[#F2F2F2]">
								O jeito independente de escolher consórcio
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
									href="mailto:contato@ajaagora.com.br"
									className="text-[14px] leading-none text-[#F2F2F2] transition-colors hover:text-white"
								>
									contato@ajaagora.com.br
								</a>
								<a
									href="tel:+5511955020229"
									className="text-[14px] leading-none text-[#F2F2F2] transition-colors hover:text-white"
								>
									+55 (11) 95502-0229
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

					{/* Linha legal + letras miúdas. No comp o bloco jurídico ocupa a
					    largura toda e os dois links vêm ABAIXO dele, não ao lado: com o
					    texto de razão social e endereço, a linha única de antes não
					    cabia mais. */}
					<div className="flex flex-col gap-4">
						<div className="h-px w-full bg-[#F2F2F2]" />
						<div className="flex flex-col gap-1">
							{LETRAS_MIUDAS.map((paragrafo) => (
								<p key={paragrafo} className="text-[14px] leading-[21px] text-[#F2F2F2]">
									{paragrafo}
								</p>
							))}
						</div>
						<div className="flex items-center gap-4">
							<a
								href="/politica-de-privacidade"
								className="text-[14px] leading-[21px] text-[#F2F2F2] transition-colors hover:text-white"
							>
								Política de Privacidade
							</a>
							<a
								href="/termos-de-uso"
								className="text-[14px] leading-[21px] text-[#F2F2F2] transition-colors hover:text-white"
							>
								Termos de Uso
							</a>
						</div>
					</div>
				</div>
			</div>
		</footer>
	);
}
