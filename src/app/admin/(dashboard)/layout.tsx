import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AdminHeader } from "@/components/admin/admin-header";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { featureFlags } from "@/lib/feature-flags";

export default function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
	const onlyKanban = featureFlags.onlyKanban;

	if (onlyKanban) {
		return (
			<div className="min-h-screen">
				<div className="mx-auto w-full max-w-7xl flex-1 overflow-x-auto px-4 py-6 sm:px-6">
					<NuqsAdapter>{children}</NuqsAdapter>
				</div>
			</div>
		);
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="overflow-x-hidden">
				<AdminHeader />
				<div className="mx-auto w-full max-w-7xl flex-1 overflow-x-auto px-4 py-6 sm:px-6">
					<NuqsAdapter>{children}</NuqsAdapter>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
