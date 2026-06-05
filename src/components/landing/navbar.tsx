"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

const navigationItems = [
	{ title: "Como funciona", href: "#como-funciona" },
	{ title: "Benefícios", href: "#beneficios" },
	{ title: "Depoimentos", href: "#depoimentos" },
	{ title: "FAQ", href: "#faq" },
];

export function Navbar() {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const handler = () => setScrolled(window.scrollY > 50);
		window.addEventListener("scroll", handler, { passive: true });
		return () => window.removeEventListener("scroll", handler);
	}, []);

	return (
		<header
			className={cn(
				"bg-background sticky top-0 z-50 transition-shadow duration-300",
				scrolled && "shadow-sm",
			)}
		>
			<div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-4 sm:px-6">
				<Link href="/" className="font-serif text-xl font-semibold">
					Aja Agora
				</Link>

				<nav className="text-muted-foreground hidden items-center gap-6 font-medium md:flex">
					{navigationItems.map((item) => (
						<a key={item.href} href={item.href} className="hover:text-primary transition-colors">
							{item.title}
						</a>
					))}
				</nav>

				<div className="flex items-center gap-4">
					<ThemeToggle />
					<Button
						size="lg"
						className="hidden sm:inline-flex"
						render={<Link href="/chat" />}
						nativeButton={false}
					>
						Começar
					</Button>

					<DropdownMenu>
						<DropdownMenuTrigger
							className="md:hidden"
							render={<Button variant="outline" size="icon" />}
						>
							<MenuIcon />
							<span className="sr-only">Menu</span>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-56" align="end">
							<DropdownMenuGroup>
								{navigationItems.map((item) => (
									<DropdownMenuItem key={item.href}>
										<a href={item.href}>{item.title}</a>
									</DropdownMenuItem>
								))}
								<DropdownMenuItem>
									<Link href="/chat">Começar agora</Link>
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</header>
	);
}
