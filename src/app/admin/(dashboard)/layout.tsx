import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/admin/app-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AdminHeader />
        <div className="flex-1 overflow-auto p-6">
          <NuqsAdapter>{children}</NuqsAdapter>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
