import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type KvCtaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: "primary" | "outline";
	size?: "md" | "sm";
};

// ── Estado de TOQUE (A6, 2026-08-30) ────────────────────────────────────────
//
// Até aqui a única resposta do botão era `hover:`, e hover não existe em
// celular — que é onde está o tráfego pago inteiro. Na prática, no aparelho
// que importa, todo CTA da home era tocado e não devolvia sinal nenhum.
//
// Não é teoria: o nosso próprio mapa de calor mediu **15 `rage_click` sobre o
// hero no mobile** entre 18 e 30/08. `rage_click` é o registro de "toquei, não
// vi nada acontecer, toquei de novo".
//
// O estado mora no ÁTOMO porque é exatamente para isso que ele existe: um lugar
// resolve as 8 seções que o usam, e a nona nasce corrigida.
const VARIANT_CLASS: Record<NonNullable<KvCtaButtonProps["variant"]>, string> = {
	// 105% de brilho sobre um vermelho já saturado é mudança que não se enxerga —
	// o CTA principal do site parecia não ter hover nenhum. 110% se percebe.
	// No toque o caminho é o oposto (escurece): pressionado tem que parecer
	// afundado, e clarear ainda mais um coral já claro não lê como pressão.
	primary: "bg-[#F2404F] text-white hover:brightness-110 active:brightness-95",
	// Contorno não tem brilho para escurecer — o sinal é a mesma inversão do
	// hover, que aqui passa a valer também no dedo.
	outline:
		"border border-[#021628] text-[#021628] hover:bg-[#021628] hover:text-white active:bg-[#021628] active:text-white",
};

/**
 * O afundar, comum às duas variantes.
 *
 * `motion-reduce` zera SÓ a escala. A mudança de brilho/cor continua valendo
 * para quem pede menos animação: cor não é movimento, e remover o retorno
 * inteiro trocaria um problema de acessibilidade (vestibular) por outro
 * (ninguém sabe se o toque pegou).
 */
const PRESSAO_CLASS = "active:scale-[0.97] motion-reduce:active:scale-100";

const SIZE_CLASS: Record<NonNullable<KvCtaButtonProps["size"]>, string> = {
	md: "h-[52px] px-8 text-[16px] font-semibold",
	sm: "rounded-full px-4 py-2 text-[12px] font-semibold leading-4",
};

// `transform` entrou na lista explícita junto com o `active:scale`: a
// transição nomeia as propriedades uma a uma, então uma escala fora dela
// mudaria de valor em salto seco, sem os 150ms que fazem o afundar parecer
// resposta e não glitch.
const BASE_CLASS =
	"inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full transition-[filter,color,background-color,transform] disabled:pointer-events-none disabled:opacity-50";

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
	return cn(BASE_CLASS, VARIANT_CLASS[variant], PRESSAO_CLASS, SIZE_CLASS[size], className);
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
	return (
		<button
			type={type}
			// `data-kv-cta` é a identidade do átomo na página. Existe para a varredura
			// de rótulo (`cta-rotulo-unico.test.tsx`) poder perguntar "quem são os
			// CTAs desta seção?" sem adivinhar pela classe do Tailwind — adivinhar
			// pela classe faria mexer no raio da pill quebrar um teste de COPY.
			data-kv-cta=""
			className={kvCtaClass({ variant, size, className })}
			{...props}
		/>
	);
}
