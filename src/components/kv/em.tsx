import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Ênfase de palavra-chave dos títulos do Key Visual.
 *
 * O padrão do comp é: título em Poppins (base) com UMA ou mais palavras-chave
 * em **Merriweather itálico** (Bold/ExtraBold/Black Italic conforme o título).
 * Ex.: "Uma jornada em poucos <Em>Movimentos</Em>", "Escolha o seu <Em w="black">tipo</Em>…".
 *
 * `w` = peso (Merriweather no Google Fonts só tem 400/700/900 → ExtraBold cai em
 * bold e SemiBold em bold). `italic=false` para os poucos casos upright
 * (ex.: confiança "compara" = Merriweather Black upright).
 */
export function Em({
	children,
	w = "bold",
	italic = true,
	className,
}: {
	children: ReactNode;
	w?: "bold" | "black";
	italic?: boolean;
	className?: string;
}) {
	return (
		<em
			className={cn(
				"font-[family-name:var(--font-merriweather)]",
				w === "black" ? "font-black" : "font-bold",
				italic ? "italic" : "not-italic",
				className,
			)}
		>
			{children}
		</em>
	);
}
