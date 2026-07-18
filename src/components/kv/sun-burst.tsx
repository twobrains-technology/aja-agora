import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Sunburst decorativo "Forma 04" do Key Visual — raios em CUNHA afunilada (mais
 * largos na base, estreitando pra fora, pontas retas) irradiando de um centro
 * vazio. É o grafismo que aparece atrás da consultora no hero e atrás das fotos
 * (tipos/comparação), distinto do `SunMark` (o símbolo/logo).
 *
 * - `rays` = número de raios. `color` = cor (coral #F2404F padrão; cinza
 *   Grafite/500 no lado "financiamento" da comparação).
 * - `inner`/`outer` = raio interno/externo (viewBox -100..100). `barWidth` =
 *   largura na base; `tipRatio` = fração da largura na ponta externa (afunila).
 * - `arcSpan`/`arcStart` = para leques parciais (ex.: hero só metade inferior,
 *   comparação semicírculo atrás da meia-lua). 360 = anel completo.
 */
interface SunBurstProps extends Omit<SVGProps<SVGSVGElement>, "fill"> {
	rays?: number;
	color?: string;
	inner?: number;
	outer?: number;
	barWidth?: number;
	tipRatio?: number;
	arcSpan?: number;
	arcStart?: number;
}

export function SunBurst({
	rays = 14,
	color = "#F2404F",
	inner = 46,
	outer = 98,
	barWidth = 20,
	tipRatio = 0.32,
	arcSpan = 360,
	arcStart = 0,
	className,
	...props
}: SunBurstProps) {
	const full = arcSpan >= 360;
	const step = full ? 360 / rays : arcSpan / Math.max(rays - 1, 1);
	const w1 = barWidth / 2;
	const w2 = (barWidth * tipRatio) / 2;
	return (
		<svg
			viewBox="-100 -100 200 200"
			xmlns="http://www.w3.org/2000/svg"
			role="presentation"
			aria-hidden="true"
			className={cn("block overflow-visible", className)}
			{...props}
		>
			{Array.from({ length: rays }, (_, i) => {
				const angle = arcStart + step * i;
				return (
					<polygon
						// biome-ignore lint/suspicious/noArrayIndexKey: raios fixos
						key={i}
						points={`${-w1},${-inner} ${w1},${-inner} ${w2},${-outer} ${-w2},${-outer}`}
						fill={color}
						transform={`rotate(${angle})`}
					/>
				);
			})}
		</svg>
	);
}
