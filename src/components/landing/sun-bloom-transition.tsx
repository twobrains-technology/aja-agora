"use client";

import { motion } from "motion/react";
import { useEffect } from "react";

import { SunMark } from "@/components/brand/sun-mark";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";

interface SunBloomTransitionProps {
	active: boolean;
	onComplete: () => void;
}

/**
 * Transição "nascer do dia" — o sol da marca floresce do centro enquanto um
 * banho radial azul→cyan toma a tela, antes de abrir a conversa. Substitui o
 * antigo galaxy-transition (motivo espaço) pelo motivo solar da marca.
 */
export function SunBloomTransition({ active, onComplete }: SunBloomTransitionProps) {
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		if (!active) return;
		const duration = reduceMotion ? 200 : 1000;
		const timer = setTimeout(onComplete, duration);
		return () => clearTimeout(timer);
	}, [active, reduceMotion, onComplete]);

	if (!active) return null;

	return (
		<motion.div
			className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--surface-ink)]"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.3 }}
		>
			{/* Banho radial azul→cyan emergindo do centro */}
			<motion.div
				className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(3,110,255,.45),rgba(3,178,217,.15)_45%,transparent_72%)]"
				initial={{ scale: 0.2, opacity: 0 }}
				animate={{ scale: 1.4, opacity: 1 }}
				transition={{ duration: 0.9, ease: [0.21, 0.47, 0.32, 0.98] }}
			/>
			<motion.div
				initial={{ scale: 0.4, opacity: 0 }}
				animate={{ scale: 1, opacity: 1 }}
				transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
				className="relative"
			>
				<SunMark variant="white" className="size-32" />
			</motion.div>
		</motion.div>
	);
}
