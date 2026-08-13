"use client";

import {
	ActivityIcon,
	BadgeCheckIcon,
	BotIcon,
	BuildingIcon,
	ChartPieIcon,
	FlaskConicalIcon,
	HeadsetIcon,
	KanbanIcon,
	MessageSquareTextIcon,
	MessagesSquareIcon,
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
import { podeAcessarRota, type Role } from "@/lib/admin/role-scope";

const settingsItems = [
	{ title: "Perfil", href: "/admin/profile", icon: UserIcon },
	// Só o admin enxerga — `podeAcessarRota` filtra este item pelas outras roles
	// (`ROTAS_SO_DE_ADMIN` em `role-scope.ts`), a mesma política que o `proxy.ts`
	// aplica na navegação.
	{ title: "WhatsApp", href: "/admin/whatsapp/configuracao", icon: BadgeCheckIcon },
];

export function AppSidebar({ role = "viewer" }: { role?: Role }) {
	const pathname = usePathname();

	// Mesmo filtro que o `proxy.ts` aplica na navegação (`role-scope.ts`): o menu
	// não pode listar tela que a pessoa não abre. Antes ele era estático — a mesa
	// externa veria "Atendentes", "Administradoras", "Simulador" e só descobriria
	// que não pode ao ser jogada de volta pro pipeline.
	const permitido = <T extends { href: string }>(itens: T[]) =>
		itens.filter((i) => podeAcessarRota(role, i.href));

	const menuItems = permitido([
		{ title: "Agora", href: "/admin", icon: ActivityIcon },
		{ title: "Performance", href: "/admin/performance", icon: ChartPieIcon },
	]);
	const applicationItems = permitido([
		{ title: "Pipeline", href: "/admin/pipeline", icon: KanbanIcon },
		{ title: "Conversas", href: "/admin/conversations", icon: MessageSquareTextIcon },
		{ title: "Atendentes", href: "/admin/attendants", icon: UsersIcon },
		{ title: "Administradoras", href: "/admin/administradoras", icon: BuildingIcon },
		{ title: "Atendentes de mesa", href: "/admin/atendentes-mesa", icon: HeadsetIcon },
		{ title: "Agentes", href: "/admin/personas", icon: BotIcon },
		{ title: "Templates WhatsApp", href: "/admin/whatsapp/templates", icon: MessagesSquareIcon },
		{ title: "Simulador", href: "/admin/simulator", icon: FlaskConicalIcon },
	]);
	const configItems = permitido(settingsItems);

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

				{applicationItems.length > 0 && (
					<SidebarGroup>
						<SidebarGroupLabel>Aplicações</SidebarGroupLabel>
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
				)}

				{configItems.length > 0 && (
					<SidebarGroup>
						<SidebarGroupLabel>Configurações</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{configItems.map((item) => (
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
			</SidebarContent>
			<SidebarFooter />
		</Sidebar>
	);
}
