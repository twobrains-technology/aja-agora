import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type KvCtaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "outline";
	size?: "md" | "sm";
};

const VARIANT_CLASS: Record<NonNullable<KvCtaButtonProps["variant"]>, string> = {
	primary: "bg-[#F2404F] text-white hover:brightness-105",
	outline: "border border-[#021628] text-[#021628] hover:bg-[#021628] hover:text-white",
};

const SIZE_CLASS: Record<NonNullable<KvCtaButtonProps["size"]>, string> = {
	md: "h-[52px] px-8 text-[16px] font-semibold",
	sm: "rounded-full px-4 py-2 text-[12px] font-semibold leading-4",
};

const BASE_CLASS =
	"inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full transition-[filter,color,background-color] disabled:pointer-events-none disabled:opacity-50";

/**
 * As classes da pill, sem o `<button>`.
 *
 * Existe para o CTA que NAVEGA (o "Voltar para o Início" do 404, que precisa ser
 * uma âncora e não um botão) poder ter a mesma pill sem copiar a lista de
 * classes — cópia que sairia do lugar na primeira vez que a marca mexesse no
 * raio ou na altura do botão.
 */
export function kvCtaClass({
	variant = "primary",
	size = "md",
	className,
}: Pick<KvCtaButtonProps, "variant" | "size" | "className"> = {}) {
	return cn(BASE_CLASS, VARIANT_CLASS[variant], SIZE_CLASS[size], className);
}

// Botão CTA compartilhado das seções do Key Visual — pill vermelha (primary),
// contorno navy (outline). Todo CTA de conversão ("Fale com a AJA", "Comparar
// agora") usa este átomo em vez de reescrever a pill em cada seção.
export function KvCtaButton({
	variant = "primary",
	size = "md",
	className,
	type = "button",
	...props
}: KvCtaButtonProps) {
	return <button type={type} className={kvCtaClass({ variant, size, className })} {...props} />;
}
