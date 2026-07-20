"use client";

import { ArrowRight, Grab, Info } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { SunMark } from "@/components/brand/sun-mark";
import { Card, CardContent } from "@/components/ui/card";
import type { ContemplationDialPayload } from "@/lib/chat/types";
import { computeContemplationDial, paymentAfterLabel } from "@/lib/consorcio/contemplation-dial";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useRevealSelection } from "../reveal-selection";

// Mostrador de contemplação — re-UX arrastável (handoff componentes-aja). O
// ponteiro semicircular navega o mês-alvo (Pointer Events + teclado, role=slider);
// o foco é o "antes → depois": as duas parcelas que importam (até contemplar e
// após receber, com o lance abatido). Os VALORES continuam vindo da MESMA função
// pura compartilhada com o backend (computeContemplationDial) — o protótipo é só
// referência visual. Ressalva de "estimativa" no rodapé (CDC art. 30/37).

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// FIX-242 (rodada 2, Fable r1, §D2.3): PARCELA nunca arredonda (CDC art. 30).
// Carta/lance (valores redondos) seguem em `brl` acima; só a parcela (antes/
// depois da contemplação) precisa de centavos.
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function ContemplationDial({ payload }: { payload: ContemplationDialPayload }) {
	const reduce = useReducedMotion();

	// FIX-196 — quando o dial faz parte de um reveal com seletor, REBINDA à cota
	// selecionada (recalcula no lugar). Os parâmetros de lance
	// (historicalWinningBidPct/referenceMonth/maxEmbutidoPct) só existem pra cota
	// recomendada — numa alternativa caem na heurística do motor. Sem contexto de
	// reveal (turno separado do simulador, o caso comum), usa o próprio payload.
	const reveal = useRevealSelection();
	const selCota = reveal.isReveal ? reveal.selectedCota : null;
	const usesRichParams = selCota == null || selCota.isRecommended;
	const creditValue = selCota?.creditValue ?? payload.creditValue;
	const termMonths = selCota?.termMonths ?? payload.termMonths;
	const monthlyPayment = selCota?.monthlyPayment ?? payload.monthlyPayment;

	const MIN = 1;
	const MAX = Math.max(3, termMonths);
	const [month, setMonth] = useState(() => clamp(payload.initialTargetMonth, MIN, MAX));
	const gaugeRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);

	// Mês efetivo clampado contra o prazo EFETIVO (o rebind pode mudar o teto).
	const activeMonth = clamp(month, MIN, MAX);
	// FIX-198 (a11y/WCAG slider) — passo grande do PageUp/PageDown: ~10% do
	// intervalo, mínimo 3 meses (setas movem ±1).
	const bigStep = Math.max(3, Math.round((MAX - MIN) / 10));

	const r = useMemo(
		() =>
			computeContemplationDial({
				creditValue,
				termMonths,
				targetMonth: activeMonth,
				// FIX-C1: calibra a curva no par real da oferta (lance% · mês).
				historicalWinningBidPct: usesRichParams ? payload.historicalWinningBidPct : undefined,
				referenceMonth: usesRichParams ? payload.referenceMonth : undefined,
				monthlyPayment,
				maxEmbutidoPct: usesRichParams ? payload.maxEmbutidoPct : undefined,
			}),
		[activeMonth, creditValue, termMonths, monthlyPayment, usesRichParams, payload],
	);

	// FIX-C5: confronto do lance declarado na qualificação com a parte em DINHEIRO.
	const declaredCovers =
		payload.declaredLanceValue != null && r.mode === "lance"
			? payload.declaredLanceValue >= r.ownCashValue
			: null;

	const fraction = (activeMonth - MIN) / Math.max(1, MAX - MIN);
	const angle = Math.PI * (1 - fraction); // mês 1 → π (esquerda) · fim → 0 (direita)
	const tipX = 100 + 72 * Math.cos(angle);
	const tipY = 100 - 72 * Math.sin(angle);

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
					aria-valuenow={activeMonth}
					aria-valuetext={`${activeMonth} ${activeMonth === 1 ? "mês" : "meses"} até contemplar`}
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
						// FIX-198 — slider operável por teclado (WCAG): setas ±1, PageUp/Down
						// passo grande, Home/End nos extremos do prazo.
						let next: number | null = null;
						switch (e.key) {
							case "ArrowLeft":
							case "ArrowDown":
								next = activeMonth - 1;
								break;
							case "ArrowRight":
							case "ArrowUp":
								next = activeMonth + 1;
								break;
							case "PageDown":
								next = activeMonth - bigStep;
								break;
							case "PageUp":
								next = activeMonth + bigStep;
								break;
							case "Home":
								next = MIN;
								break;
							case "End":
								next = MAX;
								break;
							default:
								return;
						}
						setMonth(clamp(next, MIN, MAX));
						e.preventDefault();
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
					<span className="text-[1.9rem] font-bold leading-none tabular-nums">{activeMonth}</span>
					<span className="ml-1.5 text-xs text-muted-foreground">
						{activeMonth === 1 ? "mês" : "meses"} até contemplar
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

				{/* Antes → depois: as duas parcelas que importam */}
				<div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
					<div className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-border bg-muted px-3 py-2.5">
						<span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
							Até contemplar
						</span>
						<b className="text-[1.18rem] font-bold tabular-nums">{brl2(monthlyPayment)}</b>
						<small className="text-[10px] text-muted-foreground">
							por ~{activeMonth} {activeMonth === 1 ? "mês" : "meses"}
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
							{r.paymentAfterContemplation != null ? brl2(r.paymentAfterContemplation) : "—"}
						</b>
						<small className="text-[10px] text-muted-foreground">
							{paymentAfterLabel(r.paymentAfterContemplation, monthlyPayment)}
						</small>
					</div>
				</div>

				{/* Receita */}
				<div className="space-y-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5">
					<div className="flex items-baseline justify-between gap-3 text-xs">
						<span className="text-muted-foreground">Lance pra contemplar no mês {activeMonth}</span>
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
