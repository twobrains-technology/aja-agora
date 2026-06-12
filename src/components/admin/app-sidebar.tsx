"use client";

import {
	BotIcon,
	ChartPieIcon,
	FlaskConicalIcon,
	KanbanIcon,
	MessageSquareTextIcon,
	SettingsIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SunMark } from "@/components/brand/sun-mark";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

const settingsItems = [
	{ title: "Perfil", href: "/admin/profile", icon: UserIcon },
	{ title: "Configuracoes", href: "/admin/settings", icon: SettingsIcon },
];

export function AppSidebar() {
	const pathname = usePathname();

	const menuItems = [{ title: "Dashboard", href: "/admin", icon: ChartPieIcon }];
	const applicationItems = [
		{ title: "Pipeline", href: "/admin/pipeline", icon: KanbanIcon },
		{ title: "Conversas", href: "/admin/conversations", icon: MessageSquareTextIcon },
		{ title: "Atendentes", href: "/admin/attendants", icon: UsersIcon },
		{ title: "Agentes", href: "/admin/personas", icon: BotIcon },
		{ title: "Simulador", href: "/admin/simulator", icon: FlaskConicalIcon },
	];

	function isActive(href: string) {
		if (href === "/admin") {
			return pathname === "/admin";
		}
		return pathname.startsWith(href);
	}

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							className="gap-2.5 !bg-transparent [&>svg]:size-8"
							render={<Link href="/admin" />}
						>
							<div className="flex size-8 items-center justify-center rounded-lg bg-[var(--surface-ink)]">
								<SunMark variant="white" className="size-5" />
							</div>
							<div className="flex flex-col items-start">
								<span className="text-lg font-semibold">Aja Agora</span>
								<span className="text-xs font-light">Admin Panel</span>
							</div>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				{menuItems.length > 0 && (
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu>
								{menuItems.map((item) => (
									<SidebarMenuItem key={item.href}>
										<SidebarMenuButton
											render={<Link href={item.href} />}
											isActive={isActive(item.href)}
											tooltip={item.title}
										>
											<item.icon />
											<span>{item.title}</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				)}

				<SidebarGroup>
					<SidebarGroupLabel>Aplicacoes</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{applicationItems.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										render={<Link href={item.href} />}
										isActive={isActive(item.href)}
										tooltip={item.title}
									>
										<item.icon />
										<span>{item.title}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

				<SidebarGroup>
					<SidebarGroupLabel>Configuracoes</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{settingsItems.map((item) => (
								<SidebarMenuItem key={item.href}>
									<SidebarMenuButton
										render={<Link href={item.href} />}
										isActive={isActive(item.href)}
										tooltip={item.title}
									>
										<item.icon />
										<span>{item.title}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter />
		</Sidebar>
	);
}
