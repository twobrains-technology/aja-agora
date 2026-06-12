"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SunMark } from "@/components/brand/sun-mark";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import type { RecommendationCardPayload } from "@/lib/chat/types";
import { recommendationFitLabel } from "@/lib/consorcio/score-label";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

// docx passo 4: "tipo de grupo" no resumo por opção.
const CATEGORY_LABELS: Record<RecommendationCardPayload["category"], string> = {
	imovel: "Imóvel",
	auto: "Automóvel",
	moto: "Moto",
	servicos: "Serviços",
};

// Decisão de produto (Bernardo, 2026-06-11): card mais direto — "Taxa adm" some
// do tile E do breakdown de score (assusta o leigo). adminFee segue no
// scoreBreakdown do payload (entra no cálculo do score), só não é exibido. A
// composição completa de custos é disclosed na proposta (PDF) pré-assinatura.
const FACTOR_LABELS: Partial<Record<keyof RecommendationCardPayload["scoreBreakdown"], string>> = {
	monthlyFit: "Orcamento",
	contemplation: "Contemplacao",
	termMatch: "Prazo",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
	const pct = (value * 100).toFixed(0);
	return (
		<div className="flex flex-col gap-[5px]">
			<div className="flex items-center justify-between">
				<span className="text-xs text-muted-foreground">{label}</span>
				<span className="aja-num text-xs text-muted-foreground">{pct}%</span>
			</div>
			<div className="h-[7px] rounded-full bg-muted overflow-hidden">
				<div
					className="h-full rounded-full bg-primary transition-all duration-300"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

export function RecommendationCard({ payload }: { payload: RecommendationCardPayload }) {
	const [expanded, setExpanded] = useState(false);
	const prefersReduced = useReducedMotion();

	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const handleCTA = () => {
		if (isStreaming) return;
		const label = "Tenho interesse";
		void sendAction({ kind: "interest", administradora: payload.administradora, label }, label);
	};

	return (
		<div
			className={cn(
				"w-full max-w-sm bg-card overflow-hidden",
				"rounded-[18px]",
				// borda azul destacada (rec) + sombra card
				"border border-[#bcd3ff]",
				"shadow-[0_0_0_1px_rgba(3,110,255,.18),0_1px_2px_rgba(10,31,51,.04),0_18px_44px_-28px_rgba(10,31,51,.22)]",
			)}
		>
			{/* Header */}
			<div className="px-[18px] pt-4 pb-0 flex flex-col gap-[7px]">
				{/* Selo "Recomendação" com marca-sol + rótulo qualitativo */}
				<div className="flex items-center justify-between gap-2">
					<span
						className={cn(
							"inline-flex items-center gap-1.5 h-6 px-[11px] rounded-full text-[11px] font-semibold border",
							"bg-primary/10 text-primary border-primary/28",
						)}
					>
						{/* Marca-sol colorida — assinatura da Aja Agora na recomendação */}
						<SunMark variant="color" className="size-4" />
						Recomendação
					</span>
					{/* FIX-7: rótulo qualitativo — % numérico só em contexto comparativo
					    (comparison-table); breakdown segue no expansível.
					    FIX-18: honesto quando o orçamento não fecha — monthlyFit≈0 →
					    "Melhor opção na faixa de crédito", nunca "Compatível com seu perfil". */}
					<span className="text-sm font-semibold text-primary">
						{recommendationFitLabel(payload.score, payload.scoreBreakdown.monthlyFit)}
					</span>
				</div>
				<p className="text-xs text-muted-foreground m-0 truncate">{payload.administradora}</p>
			</div>

			{/* Body */}
			<div className="px-[18px] pt-[14px] pb-[18px] flex flex-col gap-[14px]">
				{/* Hero monthly payment */}
				<div>
					<p className="text-xs text-muted-foreground m-0">Parcela mensal</p>
					<p className="aja-num text-[1.625rem] font-bold leading-none text-primary mt-1 tracking-[-0.02em]">
						{formatBRL(payload.monthlyPayment)}
						<span className="text-base font-normal text-muted-foreground">/mês</span>
					</p>
				</div>

				{/* Key metrics grid 2×2 */}
				<div className="grid grid-cols-2 gap-x-4 gap-y-3">
					<div>
						<p className="text-xs text-muted-foreground m-0">Valor do bem</p>
						<p className="aja-num text-sm font-semibold mt-0.5">{formatBRL(payload.creditValue)}</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground m-0">Prazo</p>
						<p className="aja-num text-sm font-semibold mt-0.5">{payload.termMonths} meses</p>
					</div>
					{/* docx passo 4: qtde de contemplados/mês (contagem REAL da oferta).
					    contemplationRate da Bevi é contagem, não % — só mostra o rótulo
					    de percentual quando contempladosMes não veio. */}
					{payload.contempladosMes !== undefined ? (
						<div>
							<p className="text-xs text-muted-foreground m-0">Contemplados/mês</p>
							<p className="aja-num text-sm font-semibold mt-0.5">
								{payload.contempladosMes} por mês
							</p>
						</div>
					) : (
						<div>
							<p className="text-xs text-muted-foreground m-0">Contemplação</p>
							<p className="aja-num text-sm font-semibold mt-0.5">
								{formatPercent(payload.contemplationRate)}
							</p>
						</div>
					)}
					<div>
						<p className="text-xs text-muted-foreground m-0">Tipo de grupo</p>
						<p className="text-sm font-semibold mt-0.5">{CATEGORY_LABELS[payload.category]}</p>
					</div>
				</div>

				{/* Expandable score breakdown */}
				<div>
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
						aria-expanded={expanded}
						aria-controls={`score-breakdown-${payload.id}`}
					>
						<span>Por que esta recomendação?</span>
						<ChevronDown
							className={cn("h-4 w-4 transition-transform duration-200", expanded && "rotate-180")}
						/>
					</button>
					<AnimatePresence>
						{expanded && (
							<motion.div
								id={`score-breakdown-${payload.id}`}
								initial={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
								animate={prefersReduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
								exit={prefersReduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
								transition={{ duration: 0.2 }}
								className="overflow-hidden"
							>
								<div className="flex flex-col gap-[11px] pt-3">
									{(
										Object.entries(FACTOR_LABELS) as Array<
											[keyof RecommendationCardPayload["scoreBreakdown"], string]
										>
									).map(([key, label]) => (
										<ScoreBar key={key} label={label} value={payload.scoreBreakdown[key]} />
									))}
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>

				{/* Divider */}
				<div className="h-px bg-border" />

				{/* CTA primary */}
				<Button
					className={cn(
						"w-full min-h-[46px] rounded-[13px] font-semibold text-sm gap-2",
						"shadow-[0_6px_16px_-6px_rgba(3,110,255,.5)]",
						"hover:brightness-[1.06] transition-filter",
					)}
					size="lg"
					onClick={handleCTA}
					disabled={isStreaming}
				>
					Tenho interesse
				</Button>
			</div>
		</div>
	);
}
