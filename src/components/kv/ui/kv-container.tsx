import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

// Wrapper de centralização + gutter responsivo compartilhado pelas seções do
// Key Visual.
//
// Toda seção de conteúdo usa `max-w-[1240px]` e o gutter padrão — é a coluna
// dominante do comp (frame 1440: conteúdo de 1240px começando em x=100, medido
// em Hero, Jornada, Números e no CTA do rodapé). Antes cada seção trazia a sua
// (1120/1240/1280/1320/1437/1440) com recuos próprios por cima, e a borda
// esquerda do conteúdo pulava de 60 a 160px descendo a página.
//
// As duas exceções são cromo, não conteúdo, e compartilham a coluna de ~1316px
// do comp (recuo 64px): o menu e a faixa navy do rodapé, ambos `md:px-16`.
// 1304 = os 1240px de conteúdo do comp + os 2x32 do gutter `md:px-8`. Somar o
// gutter à largura máxima é o que faz o conteúdo começar exatamente em x=100 num
// viewport de 1440 (como no comp) sem abrir mão do respiro lateral nas telas
// estreitas — com `max-w-[1240px]` cru o padding comeria a coluna por dentro e o
// conteúdo cairia em 132px.
export function KvContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("relative mx-auto w-full max-w-[1304px] px-6 md:px-8", className)}
			{...props}
		/>
	);
}

// Sombra de card "oficial" do design system AJA (Figma) — mesmo par
// elevação-curta/elevação-longa em todo card com fundo branco/off-white
// (search-card do Hero, cards de tipo/depoimento/confiança, StepCircle da
// jornada). Token único — não redeclarar por arquivo.
export const CARD_SHADOW = "shadow-[0_4px_16px_0_#00000014,0_12px_32px_-4px_#0000000A]";
