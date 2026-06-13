"use client";

import { motion } from "motion/react";
import type { QuickReplyPayload } from "@/lib/chat/types";

interface QuickRepliesProps {
	payload: QuickReplyPayload;
	onSelect: (text: string) => void;
	disabled?: boolean;
}

export function QuickReplies({ payload, onSelect, disabled }: QuickRepliesProps) {
	return (
		<motion.div
			className="flex flex-wrap gap-2"
			initial="hidden"
			animate="visible"
			variants={{
				hidden: {},
				visible: { transition: { staggerChildren: 0.08 } },
			}}
		>
			{payload.options.map((option) => (
				<motion.button
					key={option.value}
					type="button"
					variants={{
						hidden: { opacity: 0, y: 8, scale: 0.95 },
						visible: {
							opacity: 1,
							y: 0,
							scale: 1,
							transition: { type: "spring", stiffness: 300, damping: 20 },
						},
					}}
					whileHover={disabled ? undefined : { scale: 1.03, y: -2 }}
					whileTap={disabled ? undefined : { scale: 0.97 }}
					onClick={() => !disabled && onSelect(option.value)}
					disabled={disabled}
					className="inline-flex items-center gap-[9px] h-[40px] px-4 border border-border rounded-[13px] bg-card text-sm font-semibold text-foreground cursor-pointer transition-colors hover:border-primary/30 hover:bg-primary/[.05] disabled:cursor-default disabled:opacity-50"
				>
					{option.emoji && <span className="text-[17px] leading-none">{option.emoji}</span>}
					<span>{option.label}</span>
				</motion.button>
			))}
		</motion.div>
	);
}
