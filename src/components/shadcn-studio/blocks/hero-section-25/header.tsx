"use client";

import Link from "next/link";
import HeroNavigation, {
	type NavigationItem,
} from "@/components/shadcn-studio/blocks/hero-navigation-01";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navigationData: NavigationItem[] = [
	{ title: "Como funciona", href: "#como-funciona" },
	{ title: "Beneficios", href: "#beneficios" },
	{ title: "Depoimentos", href: "#depoimentos" },
	{ title: "FAQ", href: "#faq" },
];

type HeaderProps = {
	className?: string;
};

const Header = ({ className }: HeaderProps) => {
	return (
		<HeroNavigation
			navigationItems={navigationData}
			className={className}
			actions={
				<>
					<ThemeToggle />
					<Button variant="ghost" render={<Link href="/admin/login" />} nativeButton={false}>
						Login
					</Button>
					<Button render={<Link href="/chat" />} nativeButton={false}>
						Comecar
					</Button>
				</>
			}
		/>
	);
};

export default Header;
