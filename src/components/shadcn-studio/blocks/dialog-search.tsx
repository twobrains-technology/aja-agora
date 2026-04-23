"use client";

import { useRouter } from "next/navigation";
import {
  LayoutDashboardIcon,
  KanbanIcon,
  MessageSquareTextIcon,
  SearchIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

const navItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboardIcon },
  { label: "Pipeline", href: "/admin/pipeline", icon: KanbanIcon },
  { label: "Conversas", href: "/admin/conversations", icon: MessageSquareTextIcon },
];

export default function SearchDialog() {
  const router = useRouter();

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" className="!bg-transparent px-1 py-0 font-normal" />
        }
      >
        <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <SearchIcon className="size-4" />
          <span className="hidden sm:inline">Buscar...</span>
        </div>
      </DialogTrigger>
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Buscar</DialogTitle>
          <DialogDescription>Busque paginas e acoes</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup heading="Paginas">
              {navItems.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => router.push(item.href)}
                >
                  <item.icon className="size-4" />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
