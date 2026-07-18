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
