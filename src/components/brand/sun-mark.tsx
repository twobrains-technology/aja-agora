"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { type SVGProps, useId, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Símbolo do sol — a marca do Aja Agora.
 *
 * Sol nascente de 10 raios. 9 raios usam o gradiente navy→azul (ou branco/azul
 * sólido conforme a variante); 1 raio (inferior-esquerdo, `navy: true`) é sempre
 * navy sólido. `o` = ordem angular usada no escalonamento do bloom.
 *
 * - Estado-base = sol completo e visível (à prova de print / reduced-motion).
 * - `animated` dispara o "bloom" UMA vez ao entrar na viewport — apenas em
 *   instâncias grandes (institucional / fechamento), nunca em ícones pequenos.
 */
const RAYS = [
	{
		d: "M1065.34,405.47l58.36,64.81c9.8-8.83,18.64-18.67,26.42-29.36l-70.55-51.26c-4.19,5.75-8.95,11.05-14.22,15.8Z",
		navy: false,
		o: 9,
	},
	{
		d: "M946.44,241.82l-43.61-75.53c-11.46,6.63-22.18,14.4-31.95,23.21l58.36,64.81c5.26-4.74,11.03-8.92,17.2-12.49Z",
		navy: false,
		o: 2,
	},
	{
		d: "M1096.78,351.04c-1.49,7.04-3.72,13.8-6.58,20.22l79.68,35.48c5.32-11.92,9.46-24.48,12.22-37.56l-85.32-18.14Z",
		navy: false,
		o: 8,
	},
	{
		d: "M986.66,228.74l-9.12-86.75c-13.35,1.39-26.26,4.19-38.64,8.21l26.96,82.96c6.66-2.16,13.61-3.67,20.8-4.42Z",
		navy: false,
		o: 3,
	},
	{
		d: "M1028.72,233.16l26.96-82.96c-12.37-4.02-25.29-6.82-38.64-8.21l-9.12,86.75c7.18.75,14.14,2.26,20.8,4.42Z",
		navy: false,
		o: 4,
	},
	{
		d: "M915.02,270.12l-70.55-51.26c-7.73,10.62-14.36,22.07-19.77,34.19l79.68,35.48c2.91-6.53,6.48-12.69,10.64-18.41Z",
		navy: false,
		o: 1,
	},
	{
		d: "M1090.2,288.52l79.68-35.48c-5.41-12.13-12.04-23.58-19.77-34.19l-70.55,51.26c4.16,5.71,7.73,11.88,10.64,18.41Z",
		navy: false,
		o: 6,
	},
	{
		d: "M1099,329.89h87.22c0-13.47-1.44-26.61-4.12-39.28l-85.32,18.14c1.44,6.82,2.22,13.89,2.22,21.15Z",
		navy: false,
		o: 7,
	},
	{
		d: "M1065.34,254.31l58.36-64.81c-9.78-8.81-20.49-16.58-31.95-23.21l-43.61,75.53c6.17,3.57,11.94,7.75,17.2,12.49Z",
		navy: false,
		o: 5,
	},
	{
		d: "M897.8,308.74l-85.32-18.14c-2.68,12.68-4.12,25.81-4.12,39.28h87.22c0-7.25.77-14.32,2.22-21.15Z",
		navy: true,
		o: 0,
	},
] as const;

type SunMarkVariant = "white" | "blue" | "color" | "navy";

interface SunMarkProps extends Omit<SVGProps<SVGSVGElement>, "fill"> {
	variant?: SunMarkVariant;
	/** Bloom escalonado, uma vez, ao entrar na viewport (só instâncias grandes). */
	animated?: boolean;
}

export function SunMark({
	variant = "color",
	animated = false,
	className,
	...props
}: SunMarkProps) {
	const reduce = useReducedMotion();
	const ref = useRef<SVGSVGElement>(null);
	const inView = useInView(ref, { once: true, amount: 0.35 });
	const gradId = useId();
	const useGradient = variant === "color" || variant === "navy";
	const willAnimate = animated && !reduce;

	const fillFor = (ray: (typeof RAYS)[number]) => {
		if (variant === "white") return "#fff";
		if (variant === "blue") return "var(--aja-blue, #036eff)";
		return ray.navy ? "#052440" : `url(#${gradId})`;
	};

	return (
		<svg
			ref={ref}
			viewBox="805 138 388 338"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="Aja Agora"
			className={cn("block overflow-visible", className)}
			{...props}
		>
			{useGradient && (
				<defs>
					<linearGradient
						id={gradId}
						x1="808"
						y1="150"
						x2="1186"
						y2="470"
						gradientUnits="userSpaceOnUse"
					>
						<stop offset="0" stopColor="#052440" />
						<stop offset="0.55" stopColor="#0a5fd6" />
						<stop offset="1" stopColor="#036eff" />
					</linearGradient>
				</defs>
			)}
			{RAYS.map((ray, i) =>
				willAnimate ? (
					<motion.path
						// biome-ignore lint/suspicious/noArrayIndexKey: rays are a fixed static list
						key={i}
						d={ray.d}
						fill={fillFor(ray)}
						style={{ transformBox: "view-box", transformOrigin: "999px 332px" }}
						initial={{ scale: 0.55, opacity: 0.4 }}
						animate={inView ? { scale: 1, opacity: 1 } : { scale: 0.55, opacity: 0.4 }}
						transition={{ duration: 0.62, ease: [0.34, 1.56, 0.64, 1], delay: ray.o * 0.052 }}
					/>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: rays are a fixed static list
					<path key={i} d={ray.d} fill={fillFor(ray)} />
				),
			)}
		</svg>
	);
}
