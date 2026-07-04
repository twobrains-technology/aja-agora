"use client";

import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import type { GroupCardPayload } from "@/lib/chat/types";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

// Categorias mapeadas à paleta da marca (tokens --cat-*, com variante dark
// embutida): Imóvel=azul · Automóvel=cyan · Moto=coral · Serviços=navy.
const CATEGORY_STYLES: Record<GroupCardPayload["category"], { label: string; className: string }> =
	{
		imovel: {
			label: "Imóvel",
			className: "bg-cat-imovel-soft text-cat-imovel border-cat-imovel/30",
		},
		auto: {
			label: "Automóvel",
			className: "bg-cat-auto-soft text-cat-auto border-cat-auto/30",
		},
		moto: {
			label: "Moto",
			className: "bg-cat-moto-soft text-cat-moto border-cat-moto/30",
		},
		servicos: {
			label: "Serviços",
			className: "bg-cat-servicos-soft text-cat-servicos border-cat-servicos/30",
		},
	};

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

const cardSpring = { type: "spring" as const, stiffness: 400, damping: 17 };

export function GroupCard({ payload }: { payload: GroupCardPayload }) {
	const category = CATEGORY_STYLES[payload.category] ?? CATEGORY_STYLES.servicos;
	const prefersReduced = useReducedMotion();
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const handleClick = () => {
		if (isStreaming) return;
		const label = `Simular ${payload.administradora} — ${formatBRL(payload.creditValue)}`;
		void sendAction(
			{
				kind: "select-group",
				groupId: payload.id,
				administradora: payload.administradora,
				creditValue: payload.creditValue,
				termMonths: payload.termMonths,
				label,
			},
			label,
		);
	};

	return (
		<motion.div
			whileHover={prefersReduced ? undefined : { scale: 1.01, y: -2 }}
			whileTap={prefersReduced ? undefined : { scale: 0.98 }}
			transition={cardSpring}
		>
			<button
				type="button"
				className={cn(
					"w-full max-w-sm bg-card border border-border rounded-[18px] overflow-hidden cursor-pointer text-left",
					"shadow-[0_1px_2px_rgba(10,31,51,.04),0_18px_44px_-28px_rgba(10,31,51,.22)]",
					"hover:border-primary/30 transition-colors",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				)}
				aria-label={`Grupo ${payload.administradora} — credito ${formatBRL(payload.creditValue)}, parcela ${formatBRL(payload.monthlyPayment)}`}
				onClick={handleClick}
			>
				{/* Header */}
				<div className="px-[18px] pt-4 pb-0 flex flex-col gap-[7px]">
					<span
						className={cn(
							"inline-flex items-center gap-1.5 h-6 px-[11px] rounded-full text-[11px] font-semibold tracking-[.02em] border",
							category.className,
						)}
					>
						{category.label}
					</span>
					<p className="text-xs text-muted-foreground truncate m-0">{payload.administradora}</p>
				</div>

				{/* Body */}
				<div className="px-[18px] pt-[14px] pb-[18px] flex flex-col gap-[14px]">
					{/* Credit value */}
					<div>
						<p className="text-xs text-muted-foreground m-0">Valor do bem</p>
						<p className="aja-num text-xl font-bold leading-tight text-foreground mt-0.5">
							{formatBRL(payload.creditValue)}
						</p>
					</div>

					{/* Monthly payment — hero number, blue */}
					<div>
						<p className="text-xs text-muted-foreground m-0">Parcela mensal</p>
						<p className="aja-num text-2xl font-bold leading-none text-primary mt-1 tracking-[-0.02em]">
							{formatBRL(payload.monthlyPayment)}
						</p>
					</div>

					{/* 2×2 metrics grid */}
					<div className="grid grid-cols-2 gap-x-4 gap-y-3">
						<div>
							<p className="text-xs text-muted-foreground m-0">Taxa adm.</p>
							<p className="aja-num text-sm font-semibold mt-0.5">
								{formatPercent(payload.adminFeePercent)}
							</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground m-0">Prazo</p>
							<p className="aja-num text-sm font-semibold mt-0.5">{payload.termMonths} meses</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground m-0">Vagas</p>
							<p className="aja-num text-sm font-semibold mt-0.5">{payload.availableSlots}</p>
						</div>
						<div>
							<p className="text-xs text-muted-foreground m-0">Contemplação</p>
							<p className="aja-num text-sm font-semibold mt-0.5">
								{formatPercent(payload.contemplationRate)}
							</p>
						</div>
						{/* FIX-223 (Ata 2026-07-04) — lance médio, só com dado real (D11). */}
						{payload.avgBidValue != null && (
							<div>
								<p className="text-xs text-muted-foreground m-0">Lance médio</p>
								<p className="aja-num text-sm font-semibold mt-0.5">
									{formatBRL(payload.avgBidValue)}
								</p>
							</div>
						)}
					</div>

					{/* CTA ghost */}
					<Button
						size="sm"
						variant="ghost"
						className={cn(
							"w-full h-10 gap-1.5 text-xs font-semibold rounded-[13px]",
							"border border-border hover:border-border/80 hover:bg-muted/50",
						)}
						disabled={isStreaming}
						onClick={(e) => {
							e.stopPropagation();
							handleClick();
						}}
					>
						Simular esse
						<ChevronRight className="size-3.5" />
					</Button>
				</div>
			</button>
		</motion.div>
	);
}
