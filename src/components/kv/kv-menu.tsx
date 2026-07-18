"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import type { TheaterOpener } from "@/components/chat/theater/theater-context";
import { KvContainer } from "@/components/kv/ui/kv-container";
import { KvCtaButton } from "@/components/kv/ui/kv-cta-button";

// Menu (Figma: frame 'Menu' navy #052440, altura 120, conteúdo 1256 centrado).
const NAV = [
	{ label: "Seu Objetivo", href: "#hero" },
	{ label: "Como funcionamos", href: "#como-funciona" },
	{ label: "Quem somos", href: "#confianca" },
	{ label: "Dúvidas", href: "#faq" },
];

interface KvMenuProps {
	onOpenChat: TheaterOpener;
}

export function KvMenu({ onOpenChat }: KvMenuProps) {
	const [mobileOpen, setMobileOpen] = useState(false);

	return (
		<header className="relative w-full bg-[#052440]">
			<KvContainer className="flex h-[120px] max-w-[1440px] items-center justify-between px-4 md:px-4 lg:pl-[109px] lg:pr-[75px]">
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
					<KvCtaButton size="sm" onClick={(e) => onOpenChat("", e.currentTarget)}>
						Comparar agora
					</KvCtaButton>
					{/* FIX-351: não existe fluxo de login de cliente hoje (só admin em
					    /admin/login) — inerte/desabilitado até a jornada de login existir. */}
					<KvCtaButton
						variant="outline-light"
						size="sm"
						disabled
						title="Login do cliente ainda não disponível"
						className="hidden sm:inline-flex"
					>
						Entrar
					</KvCtaButton>
					<button
						type="button"
						aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
						aria-expanded={mobileOpen}
						aria-controls="kv-menu-mobile-nav"
						onClick={() => setMobileOpen((open) => !open)}
						className="flex size-9 items-center justify-center text-white lg:hidden"
					>
						{mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
					</button>
				</div>
			</KvContainer>

			{mobileOpen ? (
				<nav id="kv-menu-mobile-nav" className="border-t border-white/10 bg-[#052440] lg:hidden">
					{NAV.map((item) => (
						<a
							key={item.label}
							href={item.href}
							onClick={() => setMobileOpen(false)}
							className="block px-6 py-3 text-[16px] font-normal text-white transition-colors hover:text-white/75"
						>
							{item.label}
						</a>
					))}
				</nav>
			) : null}
		</header>
	);
}
