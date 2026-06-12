"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import type { ContemplationDialPayload } from "@/lib/chat/types";
import { computeContemplationDial, type DialLikelihood } from "@/lib/consorcio/contemplation-dial";

// Simulador-agulha (viés de contemplação do Bernardo). A agulha aponta o mês-alvo;
// arrastar pra mais cedo sobe o lance necessário. Recalcula client-side com a
// MESMA função pura do backend (computeContemplationDial). Uma ressalva discreta
// de "estimativa" no rodapé — CDC art. 30/37, sem plastrar.

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const LIKELIHOOD_LABEL: Record<DialLikelihood, { text: string; cls: string }> = {
	alta: { text: "chance alta", cls: "text-success" },
	media: { text: "chance média", cls: "text-warning" },
	baixa: { text: "chance menor", cls: "text-destructive" },
};

export function ContemplationDial({ payload }: { payload: ContemplationDialPayload }) {
	const maxMonth = Math.max(3, payload.termMonths);
	const [month, setMonth] = useState(Math.min(payload.initialTargetMonth, maxMonth));

	const r = useMemo(
		() =>
			computeContemplationDial({
				creditValue: payload.creditValue,
				termMonths: payload.termMonths,
				targetMonth: month,
				historicalWinningBidPct: payload.historicalWinningBidPct,
				// FIX-C1: calibra a curva no par real da oferta (lance% · mês) —
				// no mês de referência o dial mostra o MESMO lance do card.
				referenceMonth: payload.referenceMonth,
				monthlyPayment: payload.monthlyPayment,
				maxEmbutidoPct: payload.maxEmbutidoPct,
			}),
		[month, payload],
	);

	// FIX-C5: confronto do lance declarado na qualificação com a parte em
	// DINHEIRO exigida neste mês-alvo (o embutido sai da carta).
	const declaredCovers =
		payload.declaredLanceValue != null && r.mode === "lance"
			? payload.declaredLanceValue >= r.ownCashValue
			: null;

	// agulha: mês 1 (esquerda, -90°) → fim do grupo (direita, +90°)
	const fraction = (month - 1) / Math.max(1, maxMonth - 1);
	const rotation = -90 + fraction * 180;
	const like = LIKELIHOOD_LABEL[r.likelihood];

	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-4 pt-4">
				<p className="text-sm font-medium">Quando você quer ser contemplado?</p>

				{/* mostrador / agulha */}
				<div className="relative mx-auto w-[200px]">
					<svg viewBox="0 0 200 118" className="w-full" aria-hidden>
						<path
							d="M15 100 A 85 85 0 0 1 185 100"
							fill="none"
							stroke="currentColor"
							strokeWidth={10}
							strokeLinecap="round"
							className="text-muted"
						/>
						<motion.g
							style={{ originX: "100px", originY: "100px" }}
							animate={{ rotate: rotation }}
							transition={{ type: "spring", stiffness: 120, damping: 14 }}
						>
							<line
								x1={100}
								y1={100}
								x2={100}
								y2={26}
								stroke="currentColor"
								strokeWidth={3}
								strokeLinecap="round"
								className="text-primary"
							/>
						</motion.g>
						<circle cx={100} cy={100} r={6} className="fill-primary" />
					</svg>
					<div className="flex justify-between text-[10px] text-muted-foreground -mt-1 px-1">
						<span>Mais rápido</span>
						<span>Sem pressa</span>
					</div>
				</div>

				<div className="text-center">
					<span className="text-2xl font-semibold">{month}</span>
					<span className="text-sm text-muted-foreground"> {month === 1 ? "mês" : "meses"}</span>
					<span className={`block text-xs font-medium ${like.cls}`}>{like.text}</span>
				</div>

				<Slider
					min={1}
					max={maxMonth}
					step={1}
					value={[month]}
					onValueChange={(v) => {
						const next = Array.isArray(v) ? v[0] : v;
						if (typeof next === "number") setMonth(next);
					}}
					data-testid="dial-slider"
				/>

				{/* receita */}
				<div className="rounded-lg bg-muted/40 p-3 space-y-1.5 text-sm">
					{r.mode === "sorteio" ? (
						<p className="text-xs text-muted-foreground">
							Nesse prazo, a contemplação vem mais pelo <strong>sorteio</strong> — lance é opcional
							e a parcela fica menor.
						</p>
					) : (
						<>
							<Row label="Lance necessário" value={`${r.requiredLancePct}%`} strong />
							{r.embeddedBidValue > 0 ? (
								<Row label="↳ lance embutido (da carta)" value={brl(r.embeddedBidValue)} />
							) : null}
							{r.ownCashValue > 0 ? (
								<Row label="↳ lance próprio (dinheiro)" value={brl(r.ownCashValue)} />
							) : null}
							<Row label="Valor que você recebe" value={brl(r.receivedCredit)} />
							{/* FIX-C4: parcela real até contemplar; depois, só o lance em
							    DINHEIRO dilui (embutido reduz o crédito, não a dívida). */}
							{payload.monthlyPayment > 0 ? (
								<Row label="Parcela até contemplar" value={brl(payload.monthlyPayment)} />
							) : null}
							{r.paymentAfterContemplation != null ? (
								<Row label="Parcela depois (estimada)" value={brl(r.paymentAfterContemplation)} />
							) : null}
							{/* FIX-C5: confronto com o lance declarado na qualificação */}
							{declaredCovers != null && payload.declaredLanceValue != null ? (
								<p
									className={`text-xs ${declaredCovers ? "text-success" : "text-warning"}`}
									data-testid="dial-declared-lance"
								>
									{declaredCovers
										? `✓ Seu lance declarado (${brl(payload.declaredLanceValue)}) cobre a parte em dinheiro.`
										: `Seu lance declarado (${brl(payload.declaredLanceValue)}) não cobre a parte em dinheiro deste prazo.`}
								</p>
							) : null}
						</>
					)}
				</div>

				<p className="text-[10px] text-muted-foreground leading-snug" data-testid="dial-disclaimer">
					{/* FIX-C1: copy honesta — "histórico do grupo" era enganoso (a conta
					    usa o lance da oferta + premissas, não histórico de assembleias). */}
					Estimativa a partir dos dados da oferta. Contemplação por lance ou sorteio não é
					garantida.
				</p>
			</CardContent>
		</Card>
	);
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className={strong ? "font-semibold" : ""}>{value}</span>
		</div>
	);
}
