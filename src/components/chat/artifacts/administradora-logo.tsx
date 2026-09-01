"use client";

import { cn } from "@/lib/utils";

// FIX-222 (Ata 2026-07-04): logo da administradora no card ("traz
// confiabilidade e o cara sabe pra onde vai"). Sem `logoUrl`, cai no fallback
// gracioso (iniciais), nunca quebra o card.
//
// DOIS FORMATOS (31/08/2026), porque nenhum dos logos reais é redondo. Os 7
// assets das administradoras da Bevi são lockups horizontais, de 2,6:1 (Itaú)
// a 6,1:1 (Rodobens) — o `rounded-full` de 20px que este componente tinha
// achatava o Rodobens numa tarja de 20x3px. `medalhao` continua sendo o
// círculo (group-card, onde o logo acompanha o nome como ícone); `lockup`
// respeita a proporção do arquivo, com altura fixa e largura livre.

function administradoraInitials(administradora: string): string {
	const trimmed = administradora.trim();
	return trimmed ? trimmed.slice(0, 2).toUpperCase() : "?";
}

export function AdministradoraLogo({
	administradora,
	logoUrl,
	className,
	formato = "medalhao",
}: {
	administradora: string;
	logoUrl?: string;
	className?: string;
	/** `medalhao`: círculo pequeno ao lado do nome. `lockup`: a marca inteira,
	 *  na proporção do arquivo, no lugar do nome. */
	formato?: "medalhao" | "lockup";
}) {
	if (logoUrl) {
		return (
			// biome-ignore lint/performance/noImgElement: o logo pode vir de URL cadastrada no banco (não só do bundle), então next/image não se aplica
			<img
				src={logoUrl}
				alt={administradora}
				className={cn(
					"object-contain",
					formato === "lockup"
						? // altura manda, largura acompanha: os assets já vêm normalizados
							// por peso óptico (public/administradoras/README.md), então uma
							// altura só deixa os 7 com presença equivalente.
							"w-auto object-left"
						: "rounded-full bg-white",
					className,
				)}
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
