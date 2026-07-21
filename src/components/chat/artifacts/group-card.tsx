"use client";

import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import type { GroupCardPayload } from "@/lib/chat/types";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { AdministradoraLogo } from "./administradora-logo";

// Categorias mapeadas à paleta da marca (tokens --cat-*, com variante dark
// embutida): todas em tinta sobre areia — a distinção é o ÍCONE, não a cor.
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

// Defensivo por decisão: desde que o `group_card` passou a ser coagido
// server-side (allowlist estrita — só identidade vem do modelo), um payload sem
// grupo ancorado chega SEM os campos financeiros. Antes o número era inventado
// pela LLM e sempre "existia"; agora ele pode faltar legitimamente, e um
// `Intl.format(undefined)` renderiza "R$ NaN" enquanto `undefined.toFixed()`
// derruba o card em runtime. Faltando o dado, não se mostra o campo — nunca um
// número errado.
const formatBRL = (value: number | undefined | null): string | null =>
	typeof value === "number" && Number.isFinite(value)
		? new Intl.NumberFormat("pt-BR", {
				style: "currency",
				currency: "BRL",
			}).format(value)
		: null;

const formatPercent = (value: number | undefined | null): string | null =>
	typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : null;

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
					"w-full max-w-sm bg-card border border-border rounded-[12px] overflow-hidden cursor-pointer text-left",
					"shadow-[0_1px_2px_rgba(10,31,51,.04),0_18px_44px_-28px_rgba(10,31,51,.22)]",
					"hover:border-[color:var(--border-strong)] transition-colors",
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
					<div className="flex items-center gap-1.5">
						{/* FIX-222 (Ata 2026-07-04) — logo da administradora; fallback
						    gracioso (iniciais) enquanto os assets reais são PENDENTE. */}
						<AdministradoraLogo
							administradora={payload.administradora}
							logoUrl={payload.logoUrl}
							className="size-5 shrink-0 text-[9px]"
						/>
						<p className="text-xs text-muted-foreground truncate m-0">{payload.administradora}</p>
					</div>
				</div>

				{/* Body */}
				<div className="px-[18px] pt-[14px] pb-[18px] flex flex-col gap-[14px]">
					{/* Credit value — hero (é o que o cliente compra) */}
					{formatBRL(payload.creditValue) && (
						<div>
							<p className="text-xs text-muted-foreground m-0">Carta de crédito</p>
							<p
								data-testid="group-card-hero-credit"
								className="aja-num text-2xl font-bold leading-none text-figure mt-1 tracking-[-0.02em]"
							>
								{formatBRL(payload.creditValue)}
							</p>
						</div>
					)}

					{/* Monthly payment — discreta, logo abaixo da carta */}
					{formatBRL(payload.monthlyPayment) && (
						<div>
							<p className="text-xs text-muted-foreground m-0">Parcela mensal</p>
							<p
								data-testid="group-card-secondary-payment"
								className="aja-num text-xl font-semibold leading-tight text-foreground mt-0.5"
							>
								{formatBRL(payload.monthlyPayment)}
							</p>
						</div>
					)}

					{/* 2×2 metrics grid */}
					<div className="grid grid-cols-2 gap-x-4 gap-y-3">
						{formatPercent(payload.adminFeePercent) && (
							<div>
								<p className="text-xs text-muted-foreground m-0">Taxa adm.</p>
								<p className="aja-num text-sm font-semibold mt-0.5">
									{formatPercent(payload.adminFeePercent)}
								</p>
							</div>
						)}
						{typeof payload.termMonths === "number" && (
							<div>
								<p className="text-xs text-muted-foreground m-0">Prazo</p>
								<p className="aja-num text-sm font-semibold mt-0.5">{payload.termMonths} meses</p>
							</div>
						)}
						{typeof payload.availableSlots === "number" && (
							<div>
								<p className="text-xs text-muted-foreground m-0">Vagas</p>
								<p className="aja-num text-sm font-semibold mt-0.5">{payload.availableSlots}</p>
							</div>
						)}
						{/* FIX-231: `contemplationRate` é, na origem, `monthlyAwardedQuotas`
						    (contagem real de contemplados/mês, offer-mapper.ts:132-133) — NUNCA
						    uma fração. Mostrar como "%" era enganoso; segue o mesmo padrão de
						    contagem do recommendation-card. Ausente/0 → linha omitida. */}
						{(payload.contemplationRate ?? 0) > 0 && (
							<div>
								<p className="text-xs text-muted-foreground m-0">Contemplados/mês</p>
								<p className="aja-num text-sm font-semibold mt-0.5">
									{payload.contemplationRate} por mês
								</p>
							</div>
						)}
					</div>

					{/* FIX-231 — lance médio vira linha discreta, fora do grid (não é
					    protagonista). Só com dado real (D11: nunca fabrica). */}
					{payload.avgBidValue != null && (
						<p
							data-testid="group-card-lance-medio"
							className="text-xs text-muted-foreground m-0 -mt-1"
						>
							Lance médio {formatBRL(payload.avgBidValue)} ⌄
						</p>
					)}

					{/* CTA ghost */}
					<Button
						size="sm"
						variant="ghost"
						className={cn(
							"w-full h-10 gap-1.5 text-xs font-semibold rounded-full",
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
