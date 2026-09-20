"use client";

import {
	ActivityIcon,
	BadgeCheckIcon,
	BotIcon,
	BuildingIcon,
	ChartPieIcon,
	DownloadIcon,
	FlameIcon,
	FlaskConicalIcon,
	FootprintsIcon,
	HeadsetIcon,
	KanbanIcon,
	MegaphoneIcon,
	MessageSquareTextIcon,
	MessagesSquareIcon,
	SettingsIcon,
	TargetIcon,
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

/**
 * O menu em três grupos, na ordem em que as perguntas aparecem.
 *
 * Antes eram dois grupos e o segundo se chamava "Aplicações" — jargão de
 * arquitetura, não de quem opera. A ordem nova segue o trabalho (AJA-11):
 *
 *   1. **Acompanhamento** — leitura de resultado: como está hoje, de onde veio,
 *      quanto custou;
 *   2. **Operação** — o dia a dia: conversas, pipeline e a régua que dispara
 *      sozinha. "Régua de remarketing" sobe para cá, logo abaixo de Conversas,
 *      porque é onde a Bruna trabalha;
 *   3. **Cadastros** — quem atende e o que é configurável.
 *
 * "Cadastro da régua" vai para Cadastros: a tela da Régua já tem o botão
 * "Cadastro da régua" no cabeçalho, então o atalho não se perde.
 */
export function AppSidebar({ role = "viewer" }: { role?: Role }) {
	const pathname = usePathname();

	// Mesmo filtro que o `proxy.ts` aplica na navegação (`role-scope.ts`): o menu
	// não pode listar tela que a pessoa não abre. Antes ele era estático — a mesa
	// externa veria "Atendentes", "Administradoras", "Simulador" e só descobriria
	// que não pode ao ser jogada de volta pro pipeline.
	const permitido = <T extends { href: string }>(itens: T[]) =>
		itens.filter((i) => podeAcessarRota(role, i.href));

	const acompanhamentoItems = permitido([
		{ title: "Agora", href: "/admin", icon: ActivityIcon },
		{ title: "Performance", href: "/admin/performance", icon: ChartPieIcon },
		// A leitura por CAMPANHA, com o gasto da Meta ao lado do funil do CRM.
		{ title: "Campanhas", href: "/admin/campanhas", icon: TargetIcon },
		{ title: "Percurso do lead", href: "/admin/percurso", icon: FootprintsIcon },
		{ title: "Mapa de calor", href: "/admin/mapa-de-calor", icon: FlameIcon },
		// A área de LGPD do painel: o recorte de conversas/percurso/toques com
		// mascaramento ligado por padrão e a auditoria de quem levou o quê.
		{ title: "Exportação e dados", href: "/admin/exportacao", icon: DownloadIcon },
	]);
	const operacaoItems = permitido([
		{ title: "Conversas", href: "/admin/conversations", icon: MessageSquareTextIcon },
		{ title: "Pipeline", href: "/admin/pipeline", icon: KanbanIcon },
		// A tela da régua de remarketing: o dono do produto precisa de onde olhar
		// quem está na régua, sem depender do banco. `admin`, `viewer` e
		// `attendant` têm `*` em `role-scope`, e a mesa externa não vê — a régua não
		// é do escopo dela.
		{ title: "Régua de remarketing", href: "/admin/remarketing", icon: MegaphoneIcon },
		{ title: "Templates WhatsApp", href: "/admin/whatsapp/templates", icon: MessagesSquareIcon },
		{ title: "Simulador", href: "/admin/simulator", icon: FlaskConicalIcon },
	]);
	const cadastrosItems = permitido([
		{ title: "Atendentes", href: "/admin/attendants", icon: UsersIcon },
		{ title: "Atendentes de mesa", href: "/admin/atendentes-mesa", icon: HeadsetIcon },
		{ title: "Administradoras", href: "/admin/administradoras", icon: BuildingIcon },
		{ title: "Agentes", href: "/admin/personas", icon: BotIcon },
		// Página própria: aqui é o ajuste dos parâmetros da régua (intervalo do
		// toque, teto, horário de abertura).
		{ title: "Cadastro da régua", href: "/admin/remarketing/config", icon: SettingsIcon },
	]);
	const configItems = permitido(settingsItems);

	function isActive(href: string) {
		if (href === "/admin") {
			return pathname === "/admin";
		}
		return pathname.startsWith(href);
	}

	function Grupo({ label, itens }: { label: string; itens: typeof acompanhamentoItems }) {
		if (itens.length === 0) return null;
		return (
			<SidebarGroup>
				<SidebarGroupLabel>{label}</SidebarGroupLabel>
				<SidebarGroupContent>
					<SidebarMenu>
						{itens.map((item) => (
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
		);
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
				<Grupo label="Acompanhamento" itens={acompanhamentoItems} />
				<Grupo label="Operação" itens={operacaoItems} />
				<Grupo label="Cadastros" itens={cadastrosItems} />
				<Grupo label="Configurações" itens={configItems} />
			</SidebarContent>
			<SidebarFooter />
		</Sidebar>
	);
}
