"use client";

import { BellIcon } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function NotificationDropdown() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" />}>
				<BellIcon />
				<span className="bg-destructive absolute top-2 right-2.5 size-2 rounded-full" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-w-xs sm:max-w-96">
				<DropdownMenuLabel className="flex items-center justify-between gap-6 px-4 py-2.5 font-normal">
					<span className="text-muted-foreground text-base font-normal uppercase">
						Notificacoes
					</span>
					<Badge variant="secondary" className="bg-primary/10 text-primary font-normal">
						0 Novas
					</Badge>
				</DropdownMenuLabel>

				<DropdownMenuSeparator />

				<DropdownMenuItem className="gap-3 px-4 py-4 text-base">
					<Avatar className="size-9">
						<AvatarFallback className="bg-primary/10 text-primary text-xs">AA</AvatarFallback>
					</Avatar>
					<div className="flex w-full flex-col items-start">
						<span className="text-sm font-medium">Nenhuma notificacao</span>
						<span className="text-muted-foreground text-xs">Voce esta em dia!</span>
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
