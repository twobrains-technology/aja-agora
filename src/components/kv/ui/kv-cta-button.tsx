import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type KvCtaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "outline" | "outline-light";
	size?: "md" | "sm";
};

const VARIANT_CLASS: Record<NonNullable<KvCtaButtonProps["variant"]>, string> = {
	primary: "bg-[#F2404F] text-white hover:brightness-105",
	outline: "border border-[#021628] text-[#021628] hover:bg-[#021628] hover:text-white",
	"outline-light": "border border-white text-white hover:text-white/75",
};

const SIZE_CLASS: Record<NonNullable<KvCtaButtonProps["size"]>, string> = {
	md: "h-[52px] px-8 text-[16px] font-semibold",
	sm: "rounded-full px-4 py-2 text-[12px] font-semibold leading-4",
};

// Botão CTA compartilhado das seções do Key Visual — pill vermelha (primary),
// contorno navy (outline) ou contorno branco pra fundo escuro (outline-light).
// Todo CTA de conversão ("Fale com a AJA", "Comparar agora") usa este átomo em
// vez de reescrever a pill em cada seção.
export function KvCtaButton({
	variant = "primary",
	size = "md",
	className,
	type = "button",
	...props
}: KvCtaButtonProps) {
	return (
		<button
			type={type}
			className={cn(
				"inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full transition-[filter,color,background-color] disabled:pointer-events-none disabled:opacity-50",
				VARIANT_CLASS[variant],
				SIZE_CLASS[size],
				className,
			)}
			{...props}
		/>
	);
}
