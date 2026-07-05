"use client";

import { cn } from "@/lib/utils";

// FIX-222 (Ata 2026-07-04): logo da administradora no card ("traz
// confiabilidade e o cara sabe pra onde vai"). Assets reais (arquivos de
// imagem por administradora) são PENDENTE (sourcing/design) — sem `logoUrl`
// cadastrado, cai no fallback gracioso (iniciais), nunca quebra o card.

function administradoraInitials(administradora: string): string {
	const trimmed = administradora.trim();
	return trimmed ? trimmed.slice(0, 2).toUpperCase() : "?";
}

export function AdministradoraLogo({
	administradora,
	logoUrl,
	className,
}: {
	administradora: string;
	logoUrl?: string;
	className?: string;
}) {
	if (logoUrl) {
		return (
			// biome-ignore lint/performance/noImgElement: logo é asset externo (URL cadastrada), não asset local do bundle
			<img
				src={logoUrl}
				alt={administradora}
				className={cn("rounded-full bg-white object-contain", className)}
			/>
		);
	}
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground",
				className,
			)}
		>
			{administradoraInitials(administradora)}
		</span>
	);
}
