"use client";

import {
	BotIcon,
	ChartPieIcon,
	KanbanIcon,
	MessageSquareTextIcon,
	SettingsIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

type SidebarFlags = {
	dashboard: boolean;
	pipeline: boolean;
	attendants: boolean;
	personas: boolean;
};

const dashboardItem = { title: "Dashboard", href: "/admin", icon: ChartPieIcon };

const pipelineItem = { title: "Pipeline", href: "/admin/pipeline", icon: KanbanIcon };
const conversationsItem = {
	title: "Conversas",
	href: "/admin/conversations",
	icon: MessageSquareTextIcon,
};
const attendantsItem = { title: "Atendentes", href: "/admin/attendants", icon: UsersIcon };
const personasItem = { title: "Personas", href: "/admin/personas", icon: BotIcon };

const settingsItems = [
	{ title: "Perfil", href: "/admin/profile", icon: UserIcon },
	{ title: "Configuracoes", href: "/admin/settings", icon: SettingsIcon },
];

export function AppSidebar({ flags }: { flags: SidebarFlags }) {
	const pathname = usePathname();

	const menuItems = flags.dashboard ? [dashboardItem] : [];
	const applicationItems = [
		...(flags.pipeline ? [pipelineItem] : []),
		conversationsItem,
		...(flags.attendants ? [attendantsItem] : []),
		...(flags.personas ? [personasItem] : []),
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
							<div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
								<span className="text-sm font-bold">A</span>
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
