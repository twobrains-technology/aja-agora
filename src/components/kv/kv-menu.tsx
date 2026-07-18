import { Wordmark } from "@/components/brand/wordmark";

// Menu (Figma: frame 'Menu' navy #052440, altura 120, conteúdo 1256 centrado).
const NAV = [
	{ label: "Seu Objetivo", href: "#hero" },
	{ label: "Como funcionamos", href: "#como-funciona" },
	{ label: "Quem somos", href: "#confianca" },
	{ label: "Dúvidas", href: "#faq" },
];

export function KvMenu() {
	return (
		<header className="w-full bg-[#052440]">
			<div className="mx-auto flex h-[120px] w-full max-w-[1440px] items-center justify-between px-4 lg:pl-[109px] lg:pr-[75px]">
				<Wordmark className="h-[56px] w-auto text-white" />

				<nav className="hidden items-center gap-[48px] lg:flex xl:gap-[61px]">
					{NAV.map((item) => (
						<a
							key={item.label}
							href={item.href}
							className="text-[16px] font-normal leading-[30px] text-white transition-colors hover:text-white/75"
						>
							{item.label}
						</a>
					))}
				</nav>

				<div className="flex items-center gap-[13px]">
					<button
						type="button"
						className="rounded-full bg-[#F2404F] px-4 py-2 text-[12px] font-semibold leading-4 text-white transition-[filter] hover:brightness-105"
					>
						Comparar agora
					</button>
					<button
						type="button"
						className="hidden rounded-full border border-white px-4 py-2 text-[12px] font-semibold leading-4 text-white transition-colors hover:text-white/75 sm:block"
					>
						Entrar
					</button>
				</div>
			</div>
		</header>
	);
}
