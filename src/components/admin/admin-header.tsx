"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import SearchDialog from "@/components/shadcn-studio/blocks/dialog-search";
import NotificationDropdown from "@/components/shadcn-studio/blocks/dropdown-notification";
import ProfileDropdown from "@/components/shadcn-studio/blocks/dropdown-profile";

export function AdminHeader() {
  const { data: session } = useSession();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push("/admin/login");
  }

  const userName = session?.user?.name ?? "Admin";
  const userEmail = session?.user?.email ?? "";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="before:bg-background/60 sticky top-0 z-50 before:absolute before:inset-0 before:mask-[linear-gradient(var(--card),var(--card)_18%,transparent_100%)] before:backdrop-blur-md">
      <div className="bg-card relative z-[51] mx-auto mt-3 flex w-[calc(100%-2rem)] max-w-[calc(1280px-3rem)] items-center justify-between rounded-xl border px-6 py-2 sm:w-[calc(100%-3rem)]">
        <div className="flex items-center gap-1.5 sm:gap-4">
          <SidebarTrigger className="[&_svg]:!size-5" />
          <Separator orientation="vertical" className="hidden !h-4 sm:block" />
          <SearchDialog />
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <NotificationDropdown />
          <ProfileDropdown
            userName={userName}
            userEmail={userEmail}
            userInitials={initials}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </header>
  );
}
