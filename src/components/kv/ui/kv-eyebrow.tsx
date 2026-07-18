import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Rótulo pequeno vermelho maiúsculo acima dos títulos de seção (ex.: "CONFIANÇA
// E RESULTADO"). Repetido em quase toda seção do Key Visual — extraído pra não
// reescrever a mesma classe cinco vezes.
export function KvEyebrow({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
	return (
		<span
			className={cn(
				"text-[12px] font-semibold uppercase leading-4 tracking-wide text-[#F2404F]",
				className,
			)}
			{...props}
		/>
	);
}
