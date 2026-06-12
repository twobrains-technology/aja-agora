"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LINKS = [
	{ title: "Como trabalhamos", href: "#como" },
	{ title: "Na prática", href: "#pratica" },
	{ title: "Quem somos", href: "#sobre" },
];

export function BrandNav() {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const handler = () => setScrolled(window.scrollY > 8);
		handler();
		window.addEventListener("scroll", handler, { passive: true });
		return () => window.removeEventListener("scroll", handler);
	}, []);

	return (
		<header
			className={cn(
				"sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md backdrop-saturate-150 transition-colors duration-300",
				scrolled ? "border-border" : "border-transparent",
			)}
		>
			<div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-8 px-5 sm:px-8">
				<Link href="/" aria-label="Aja Agora" className="shrink-0">
					<Wordmark className="h-[58px] w-auto" />
				</Link>

				<nav className="hidden items-center gap-8 text-sm font-medium md:flex">
					{LINKS.map((link) => (
						<a
							key={link.href}
							href={link.href}
							className="text-muted-foreground transition-colors hover:text-foreground"
						>
							{link.title}
						</a>
					))}
				</nav>

				<div className="flex items-center gap-3">
					<Link
						href="/admin/login"
						className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
					>
						Entrar
					</Link>
					<Button
						className="h-[42px] rounded-[13px] bg-foreground px-5 text-background hover:bg-foreground/90"
						render={<Link href="/chat" />}
						nativeButton={false}
					>
						Começar
					</Button>
				</div>
			</div>
		</header>
	);
}
