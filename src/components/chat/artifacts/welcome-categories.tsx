"use client";

import { Bike, Briefcase, Car, Home } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { useChatContext } from "@/lib/chat/provider";
import type { GatePartOption, WelcomePartData } from "@/lib/chat/ui-message";

type CategoryConfig = { icon: typeof Home; sub: string };

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
	imovel: { icon: Home, sub: "Casa ou apartamento" },
	auto: { icon: Car, sub: "Novo ou seminovo" },
	moto: { icon: Bike, sub: "Nova ou usada" },
	servicos: { icon: Briefcase, sub: "Reforma ou viagem" },
};

export function WelcomeCategories({
	payload,
	active = true,
}: {
	payload: WelcomePartData;
	active?: boolean;
}) {
	const { sendAction, status } = useChatContext();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const isStreaming = status === "submitted" || status === "streaming";

	const onSelect = useCallback(
		async (option: GatePartOption) => {
			if (selectedId) return;
			setSelectedId(option.value);
			await sendAction(
				{ kind: "category", category: option.value as "imovel" | "auto" | "moto" | "servicos" },
				option.label,
			);
		},
		[sendAction, selectedId],
	);

	if (selectedId || !active) return null;

	return (
		<AnimatePresence>
			<motion.div
				className="grid grid-cols-2 gap-3 sm:grid-cols-4"
				initial="hidden"
				animate="visible"
				variants={{
					hidden: {},
					visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
				}}
			>
				{payload.options.map((opt, idx) => {
					const config = CATEGORY_CONFIG[opt.value] ?? { icon: Home, sub: "" };
					const Icon = config.icon;
					const isSelected = selectedId === opt.value;
					const isOther = selectedId !== null && !isSelected;

					return (
						<motion.button
							key={opt.value}
							type="button"
							onClick={() => onSelect(opt)}
							disabled={Boolean(selectedId) || isStreaming}
							variants={{
								hidden: { opacity: 0, y: 18, scale: 0.94 },
								visible: {
									opacity: 1,
									y: 0,
									scale: 1,
									transition: { type: "spring", stiffness: 200, damping: 20, mass: 0.7 },
								},
							}}
							whileHover={
								!selectedId
									? {
											y: -4,
											scale: 1.03,
											transition: { type: "spring", stiffness: 500, damping: 15 },
										}
									: undefined
							}
							whileTap={!selectedId ? { scale: 0.96, y: 0 } : undefined}
							animate={
								isSelected
									? {
											scale: 1.04,
											y: -2,
											transition: { type: "spring", stiffness: 300, damping: 15 },
										}
									: isOther
										? { opacity: 0.3, scale: 0.94, filter: "blur(0.5px)" }
										: undefined
							}
							className={`group relative flex flex-col items-center gap-2.5 rounded-2xl border p-4 text-center transition-colors ${
								selectedId
									? "bg-card/80"
									: "cursor-pointer bg-card/80 backdrop-blur-sm hover:bg-card"
							} ${isSelected ? "border-foreground shadow-md" : "border-border/50"}`}
						>
							<motion.div
								className="relative flex size-10 items-center justify-center rounded-xl bg-foreground text-background"
								animate={!selectedId ? { y: [0, -2, 0] } : undefined}
								transition={{
									duration: 3,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeInOut",
									delay: idx * 0.4,
								}}
							>
								<Icon className="size-4.5" strokeWidth={1.5} />
							</motion.div>
							<div className="relative">
								<span className="block text-sm font-semibold leading-tight">{opt.label}</span>
								{config.sub ? (
									<span className="mt-0.5 block text-[11px] text-muted-foreground">
										{config.sub}
									</span>
								) : null}
							</div>
							{isSelected ? (
								<motion.div
									className="absolute -bottom-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-foreground"
									layoutId="welcome-selected"
									transition={{ type: "spring", stiffness: 400, damping: 25 }}
								/>
							) : null}
						</motion.button>
					);
				})}
			</motion.div>
		</AnimatePresence>
	);
}
