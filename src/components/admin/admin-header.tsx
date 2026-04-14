"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function AdminHeader() {
  const { data: session } = useSession();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push("/admin/login");
  }

  const userName = session?.user?.name ?? "Admin";
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "viewer";

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{userName}</span>
        <Badge variant={userRole === "admin" ? "default" : "secondary"}>
          {userRole}
        </Badge>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Sair"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
