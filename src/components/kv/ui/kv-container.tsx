import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Wrapper de centralização + gutter responsivo compartilhado pelas seções do
// Key Visual. Cada seção mantém sua própria largura máxima (fiel ao frame do
// Figma — 1120/1240/1280/1440px variam por seção, não normalizar) via
// `className` (ex. `max-w-[1240px]`); este átomo só resolve o `mx-auto` +
// padding lateral repetido em toda seção.
export function KvContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn("relative mx-auto w-full px-6 md:px-8", className)} {...props} />;
}

// Sombra de card "oficial" do design system AJA (Figma) — mesmo par
// elevação-curta/elevação-longa em todo card com fundo branco/off-white
// (search-card do Hero, cards de tipo/depoimento/confiança, StepCircle da
// jornada). Token único — não redeclarar por arquivo.
export const CARD_SHADOW = "shadow-[0_4px_16px_0_#00000014,0_12px_32px_-4px_#0000000A]";
