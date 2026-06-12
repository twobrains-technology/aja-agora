"use client";

import { ArrowRight, Grab, Info } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { SunMark } from "@/components/brand/sun-mark";
import { Card, CardContent } from "@/components/ui/card";
import type { ContemplationDialPayload } from "@/lib/chat/types";
import { computeContemplationDial, type DialLikelihood } from "@/lib/consorcio/contemplation-dial";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

// Mostrador de contemplação — re-UX arrastável (handoff componentes-aja). O
// ponteiro semicircular navega o mês-alvo (Pointer Events + teclado, role=slider);
// o foco é o "antes → depois": as duas parcelas que importam (até contemplar e
// após receber, com o lance abatido). Os VALORES continuam vindo da MESMA função
// pura compartilhada com o backend (computeContemplationDial) — o protótipo é só
// referência visual. Ressalva de "estimativa" no rodapé (CDC art. 30/37).

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

// Bucket de chance → rótulo + cor + posição no medidor (coral→âmbar→verde).
const LIKELIHOOD: Record<DialLikelihood, { label: string; cls: string; pos: number }> = {
	alta: { label: "alta", cls: "text-success", pos: 82 },
	media: { label: "média", cls: "text-warning", pos: 50 },
	baixa: { label: "menor", cls: "text-destructive", pos: 18 },
};

export function ContemplationDial({ payload }: { payload: ContemplationDialPayload }) {
	const reduce = useReducedMotion();
	const maxMonth = Math.max(3, payload.termMonths);
	const MIN = 1;
	const MAX = maxMonth;
	const [month, setMonth] = useState(clamp(payload.initialTargetMonth, MIN, MAX));
	const gaugeRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);

	const r = useMemo(
		() =>
			computeContemplationDial({
				creditValue: payload.creditValue,
				termMonths: payload.termMonths,
				targetMonth: month,
				historicalWinningBidPct: payload.historicalWinningBidPct,
				// FIX-C1: calibra a curva no par real da oferta (lance% · mês).
				referenceMonth: payload.referenceMonth,
				monthlyPayment: payload.monthlyPayment,
				maxEmbutidoPct: payload.maxEmbutidoPct,
			}),
		[month, payload],
	);

	// FIX-C5: confronto do lance declarado na qualificação com a parte em DINHEIRO.
	const declaredCovers =
		payload.declaredLanceValue != null && r.mode === "lance"
			? payload.declaredLanceValue >= r.ownCashValue
			: null;

	const fraction = (month - MIN) / Math.max(1, MAX - MIN);
	const angle = Math.PI * (1 - fraction); // mês 1 → π (esquerda) · fim → 0 (direita)
	const tipX = 100 + 72 * Math.cos(angle);
	const tipY = 100 - 72 * Math.sin(angle);
	const like = LIKELIHOOD[r.likelihood];

	const setFromPointer = (clientX: number, clientY: number) => {
		const el = gaugeRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const cx = rect.left + (100 / 200) * rect.width;
		const cy = rect.top + (100 / 106) * rect.height;
		let a = Math.atan2(cy - clientY, clientX - cx);
		a = Math.max(0, Math.min(Math.PI, a));
		setMonth(clamp(Math.round(MIN + (1 - a / Math.PI) * (MAX - MIN)), MIN, MAX));
	};

	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-3.5 pt-4">
				<p className="flex items-center gap-2 text-sm font-medium">
					<span className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-ink)] p-1">
						<SunMark variant="white" className="size-full" />
					</span>
					Quando você quer ser contemplado?
				</p>

				{/* Gauge arrastável */}
				{/* biome-ignore lint/a11y/useSemanticElements: gauge custom (role=slider) operavel por ponteiro+teclado */}
				<div
					ref={gaugeRef}
					role="slider"
					aria-label="Mês alvo de contemplação"
					aria-valuemin={MIN}
					aria-valuemax={MAX}
					aria-valuenow={month}
					tabIndex={0}
					onPointerDown={(e) => {
						draggingRef.current = true;
						try {
							e.currentTarget.setPointerCapture(e.pointerId);
						} catch {
							// happy-dom / browsers sem pointer capture — segue sem capturar
						}
						setFromPointer(e.clientX, e.clientY);
						e.preventDefault();
					}}
					onPointerMove={(e) => {
						if (draggingRef.current) setFromPointer(e.clientX, e.clientY);
					}}
					onPointerUp={(e) => {
						draggingRef.current = false;
						try {
							e.currentTarget.releasePointerCapture(e.pointerId);
						} catch {
							// idem
						}
					}}
					onPointerCancel={() => {
						draggingRef.current = false;
					}}
					onKeyDown={(e) => {
						if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
							setMonth((m) => clamp(m - 1, MIN, MAX));
							e.preventDefault();
						} else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
							setMonth((m) => clamp(m + 1, MIN, MAX));
							e.preventDefault();
						}
					}}
					className="relative mx-auto w-[230px] cursor-grab touch-none select-none rounded-md outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
				>
					<svg viewBox="0 0 200 106" className="w-full overflow-visible" aria-hidden="true">
						<path
							d="M15 100 A 85 85 0 0 1 185 100"
							fill="none"
							stroke="currentColor"
							strokeWidth={12}
							strokeLinecap="round"
							className="text-muted"
						/>
						<path
							d="M15 100 A 85 85 0 0 1 185 100"
							fill="none"
							stroke="currentColor"
							strokeWidth={12}
							strokeLinecap="round"
							pathLength={100}
							strokeDasharray={100}
							strokeDashoffset={100 - fraction * 100}
							className={cn(
								"text-primary",
								!reduce && "transition-[stroke-dashoffset] duration-300",
							)}
						/>
						<line
							x1={100}
							y1={100}
							x2={tipX}
							y2={tipY}
							stroke="currentColor"
							strokeWidth={3.6}
							strokeLinecap="round"
							className="text-[var(--surface-ink)]"
						/>
						<circle
							cx={100}
							cy={100}
							r={7}
							className="fill-background stroke-[var(--surface-ink)]"
							strokeWidth={3}
						/>
					</svg>
				</div>

				<div className="-mt-1 text-center">
					<span className="text-[1.9rem] font-bold leading-none tabular-nums">{month}</span>
					<span className="ml-1.5 text-xs text-muted-foreground">
						{month === 1 ? "mês" : "meses"} até contemplar
					</span>
				</div>
				<div className="-mt-1 flex justify-between px-1 text-[11px] text-muted-foreground">
					<span>Mais rápido</span>
					<span>Sem pressa</span>
				</div>
				<p className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-primary">
					<Grab className="size-3" />
					Arraste o ponteiro pra ajustar o prazo
				</p>

				{/* Medidor de chance */}
				<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
					<span>Chance de contemplação nesse prazo</span>
					<b className={cn("font-bold capitalize", like.cls)}>{like.label}</b>
				</div>
				<div
					className="relative h-2 rounded-full"
					style={{
						background: "linear-gradient(90deg,var(--aja-coral),var(--warning) 50%,var(--success))",
					}}
				>
					<div
						className={cn(
							"absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-[var(--surface-ink)] bg-background shadow",
							!reduce && "transition-[left] duration-300",
						)}
						style={{ left: `${like.pos}%` }}
					/>
				</div>

				{/* Antes → depois: as duas parcelas que importam */}
				<div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
					<div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-[#fbfbf9] px-3 py-2.5">
						<span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
							Até contemplar
						</span>
						<b className="text-[1.18rem] font-bold tabular-nums">{brl(payload.monthlyPayment)}</b>
						<small className="text-[10px] text-muted-foreground">
							por ~{month} {month === 1 ? "mês" : "meses"}
						</small>
					</div>
					<div className="flex items-center text-primary">
						<ArrowRight className="size-4" />
					</div>
					<div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-warning/25 bg-[var(--aja-cream)] px-3 py-2.5">
						<span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
							Após receber
						</span>
						<b className="text-[1.18rem] font-bold tabular-nums text-[#8a5e09]">
							{r.paymentAfterContemplation != null ? brl(r.paymentAfterContemplation) : "—"}
						</b>
						<small className="text-[10px] text-muted-foreground">menor, depois do lance</small>
					</div>
				</div>

				{/* Receita */}
				<div className="space-y-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5">
					<div className="flex items-baseline justify-between gap-3 text-xs">
						<span className="text-muted-foreground">Lance pra contemplar no mês {month}</span>
						<b className="tabular-nums">
							{r.mode === "sorteio"
								? "sem lance (sorteio)"
								: `${brl(r.requiredLanceValue)} (${r.requiredLancePct}%)`}
						</b>
					</div>
					<div className="flex items-baseline justify-between gap-3 text-xs">
						<span className="text-muted-foreground">Valor que você recebe</span>
						<b className="tabular-nums">{brl(r.receivedCredit)}</b>
					</div>
					{declaredCovers != null && payload.declaredLanceValue != null ? (
						<p
							className={cn("text-xs", declaredCovers ? "text-success" : "text-warning")}
							data-testid="dial-declared-lance"
						>
							{declaredCovers
								? `✓ Seu lance declarado (${brl(payload.declaredLanceValue)}) cobre a parte em dinheiro.`
								: `Seu lance declarado (${brl(payload.declaredLanceValue)}) não cobre a parte em dinheiro deste prazo.`}
						</p>
					) : null}
				</div>

				<p
					className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground"
					data-testid="dial-disclaimer"
				>
					<Info className="mt-0.5 size-3 shrink-0 text-primary" />
					Estimativa a partir dos dados da oferta. Contemplação por lance ou sorteio não é
					garantida.
				</p>
			</CardContent>
		</Card>
	);
}
