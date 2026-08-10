import { headers } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Role } from "@/lib/admin/role-scope";
import { auth } from "@/lib/auth";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
	// O papel vem do SERVIDOR pro menu não oferecer porta que o `proxy.ts` vai
	// fechar na cara de quem clicar. O menu é conveniência; quem barra é o proxy.
	const session = await auth.api.getSession({ headers: await headers() });
	const role = ((session?.user as { role?: string } | undefined)?.role ?? "viewer") as Role;

	return (
		<SidebarProvider>
			<AppSidebar role={role} />
			<SidebarInset className="overflow-x-hidden">
				<AdminHeader />
				<div className="mx-auto w-full max-w-7xl flex-1 overflow-x-auto px-4 py-6 sm:px-6">
					<NuqsAdapter>{children}</NuqsAdapter>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
