import { SidebarProvider } from "@/components/ui/sidebar";
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
      <main className="flex-1 flex flex-col min-h-screen">
        <AdminHeader />
        <div className="flex-1 p-6">
          <NuqsAdapter>{children}</NuqsAdapter>
        </div>
      </main>
    </SidebarProvider>
  );
}
