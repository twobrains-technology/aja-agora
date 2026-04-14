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
    <div className="flex min-h-dvh w-full">
      <SidebarProvider>
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <AdminHeader />
          <main className="mx-auto size-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
            <NuqsAdapter>{children}</NuqsAdapter>
          </main>
        </div>
      </SidebarProvider>
    </div>
  );
}
