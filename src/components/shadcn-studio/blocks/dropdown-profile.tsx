"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
	userName?: string;
	userEmail?: string;
	userInitials?: string;
	onLogout?: () => void;
};

export default function ProfileDropdown({
	userName = "Admin",
	userEmail = "",
	userInitials = "AD",
	onLogout,
}: Props) {
	const router = useRouter();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-9" />}>
				<Avatar className="size-9 rounded-md">
					<AvatarFallback className="rounded-md bg-primary text-primary-foreground text-xs">
						{userInitials}
					</AvatarFallback>
				</Avatar>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="flex items-center gap-2 font-normal">
						<Avatar className="size-7">
							<AvatarFallback className="bg-primary text-primary-foreground text-xs">
								{userInitials}
							</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-1 flex-col items-start">
							<span className="text-foreground text-sm font-medium truncate w-full">
								{userName}
							</span>
							{userEmail && (
								<span className="text-muted-foreground text-xs truncate w-full">{userEmail}</span>
							)}
						</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />

				{/* Um item só, e que LEVA a algum lugar. Antes eram dois — "Minha
				    conta" e "Configuracoes" — sem `onClick` e sem `href`: clicavam e
				    não faziam nada, o que a equipe leu como "desabilitado" (relato da
				    Júnia, 2026-08-12). Dois destinos mortos não valem mais que um
				    vivo. O "Configuracoes" ainda ia sem cedilha. */}
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={() => router.push("/admin/perfil")}>
						<UserIcon className="text-muted-foreground" />
						<span>Meu perfil</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />

				<DropdownMenuItem variant="destructive" onClick={onLogout}>
					<LogOutIcon />
					<span>Sair</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
