"use client";

import { Bike, Briefcase, Car, Home } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";
import { SunMark } from "@/components/brand/sun-mark";
import { useChatContext } from "@/lib/chat/provider";
import type { GatePartOption, WelcomePartData } from "@/lib/chat/ui-message";

type CategoryConfig = {
	icon: typeof Home;
	sub: string;
	bgSoft: string;
	iconColor: string;
	hoverBg: string;
	hoverBorder: string;
};

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
	imovel: {
		icon: Home,
		sub: "Casa ou apartamento",
		bgSoft: "bg-[var(--cat-imovel-soft)]",
		iconColor: "text-[var(--cat-imovel)]",
		hoverBg: "group-hover:bg-[var(--cat-imovel)]",
		hoverBorder: "group-hover:border-[var(--cat-imovel)]",
	},
	auto: {
		icon: Car,
		sub: "Novo ou seminovo",
		bgSoft: "bg-[var(--cat-auto-soft)]",
		iconColor: "text-[var(--cyan-600)]",
		hoverBg: "group-hover:bg-[var(--cat-auto)]",
		hoverBorder: "group-hover:border-[var(--cat-auto)]",
	},
	moto: {
		icon: Bike,
		sub: "Nova ou usada",
		bgSoft: "bg-[var(--cat-moto-soft)]",
		iconColor: "text-[var(--coral-600)]",
		hoverBg: "group-hover:bg-[var(--cat-moto)]",
		hoverBorder: "group-hover:border-[var(--cat-moto)]",
	},
	servicos: {
		icon: Briefcase,
		sub: "Reforma ou viagem",
		bgSoft: "bg-[var(--cat-servicos-soft)]",
		iconColor: "text-[var(--cat-servicos)]",
		hoverBg: "group-hover:bg-[var(--cat-servicos)]",
		hoverBorder: "group-hover:border-[var(--cat-servicos)]",
	},
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
	const reduced = useReducedMotion();

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
				className="grid grid-cols-2 gap-3 w-full max-w-[340px]"
				initial="hidden"
				animate="visible"
				variants={{
					hidden: {},
					visible: {
						transition: { staggerChildren: reduced ? 0 : 0.12, delayChildren: reduced ? 0 : 0.05 },
					},
				}}
			>
				{payload.options.map((opt) => {
					const config = CATEGORY_CONFIG[opt.value] ?? {
						icon: Home,
						sub: "",
						bgSoft: "bg-muted",
						iconColor: "text-foreground",
						hoverBg: "group-hover:bg-foreground",
						hoverBorder: "group-hover:border-foreground",
					};
					const Icon = config.icon;
					const isSelected = selectedId === opt.value;
					const isOther = selectedId !== null && !isSelected;

					return (
						<motion.button
							key={opt.value}
							type="button"
							onClick={() => onSelect(opt)}
							disabled={Boolean(selectedId) || isStreaming}
							variants={
								reduced
									? { hidden: {}, visible: {} }
									: {
											hidden: { opacity: 0, y: 18, scale: 0.94 },
											visible: {
												opacity: 1,
												y: 0,
												scale: 1,
												transition: { type: "spring", stiffness: 200, damping: 20, mass: 0.7 },
											},
										}
							}
							whileHover={
								!selectedId && !reduced
									? {
											y: -3,
											transition: { type: "spring", stiffness: 400, damping: 18 },
										}
									: undefined
							}
							whileTap={!selectedId && !reduced ? { scale: 0.97, y: 0 } : undefined}
							animate={
								isSelected
									? {
											scale: 1.02,
											y: -2,
											transition: { type: "spring", stiffness: 300, damping: 15 },
										}
									: isOther
										? { opacity: 0.3, scale: 0.94, filter: "blur(0.5px)" }
										: undefined
							}
							className={`group relative overflow-hidden flex flex-col items-start gap-[11px] p-[15px] rounded-[18px] border border-border bg-card text-left cursor-pointer transition-[border-color,box-shadow] duration-200 ${config.hoverBorder} hover:shadow-md disabled:cursor-default`}
						>
							{/* marca-sol marca-d'água */}
							<SunMark
								variant="color"
								className={`absolute right-[-12px] top-[-12px] w-14 h-14 pointer-events-none transition-[opacity,transform] duration-300 ${
									reduced
										? "opacity-[.07]"
										: "opacity-[.07] group-hover:opacity-[.13] group-hover:rotate-[28deg] group-hover:scale-[1.08]"
								}`}
								aria-hidden="true"
							/>

							{/* ícone */}
							<div
								className={`relative flex size-[46px] items-center justify-center rounded-[13px] transition-[background,color,transform] duration-200 ${config.bgSoft} ${config.iconColor} ${config.hoverBg} ${reduced ? "" : "group-hover:scale-[1.05]"} group-hover:text-white`}
							>
								<Icon className="size-6" strokeWidth={1.75} />
							</div>

							{/* textos */}
							<div className="relative flex flex-col gap-0">
								<span className="text-sm font-semibold leading-tight text-foreground">
									{opt.label}
								</span>
								{config.sub ? (
									<span className="mt-[-5px] text-[11px] text-muted-foreground leading-snug">
										{config.sub}
									</span>
								) : null}
							</div>
						</motion.button>
					);
				})}
			</motion.div>
		</AnimatePresence>
	);
}
