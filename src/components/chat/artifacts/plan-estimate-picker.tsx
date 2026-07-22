"use client";

import { ArrowRight, Check, Info } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { SunMark } from "@/components/brand/sun-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { PlanIntent } from "@/lib/agent/qualify-config";
import { useChatContext } from "@/lib/chat/provider";
import type { PlanGatePartData } from "@/lib/chat/ui-message";
import {
	clampLanceToAsset,
	computePlanEstimate,
	TYPICAL_ADMIN_FEE_PCT,
} from "@/lib/consorcio/plan-estimate";
import { cn } from "@/lib/utils";

// "Planeje sua conquista" (passo 2, gate credit) — re-UX GUIADA POR INTENÇÃO
// (handoff componentes-aja). Os 4 sliders simultâneos confundiam; agora o usuário
// escolhe O QUE MAIS IMPORTA ("menor parcela" / "receber rápido" / "tenho um
// lance") e só o controle relevante aparece. A parcela é o RESULTADO calmo
// (total / prazo), não input. Aderente à jornada canônica (valor → prioridade/
// tempo → lance). TUDO aqui é ESTIMATIVA DE MERCADO (selo obrigatório) — a Bevi só
// simula com CPF (identify, D1); os números reais chegam no reveal e no simulador
// do passo 4 (oferta ativa).

const brl = (v: number) =>
	v >= 1_000_000
		? `R$ ${(v / 1_000_000).toFixed(1).replace(".0", "")} mi`
		: v >= 1_000
			? `R$ ${(v / 1_000).toFixed(0)} mil`
			: `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const brlExact = (v: number) =>
	`R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// FIX-55: extrai o número de um texto livre ("R$ 37.500", "37500") — só dígitos.
// null quando não há dígito algum (input vazio).
const parseDigits = (s: string): number | null => {
	const d = s.replace(/\D/g, "");
	return d ? Number.parseInt(d, 10) : null;
};

const INTENTS: { value: PlanIntent; label: string }[] = [
	{ value: "parcela", label: "Menor parcela" },
	{ value: "rapido", label: "Receber rápido" },
	{ value: "lance", label: "Tenho um lance" },
];

export function PlanEstimatePicker({
	payload,
	active = true,
}: {
	payload: PlanGatePartData;
	active?: boolean;
}) {
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";
	const [submitted, setSubmitted] = useState(false);

	const [assetValue, setAssetValue] = useState(payload.credit.default);
	const [intent, setIntent] = useState<PlanIntent>(payload.intentDefault);
	const [termMonths, setTermMonths] = useState(payload.term.default);
	const [targetMonth, setTargetMonth] = useState(payload.targetMonthDefault);
	const [lanceValueRaw, setLanceValue] = useState(0);
	const [lanceEmbutido, setLanceEmbutido] = useState(false);

	const withTarget = intent === "rapido";
	const withLance = intent === "lance";

	// QA-crítico P2: o teto do lance acompanha o valor do bem — clamp derivado, sem
	// estado duplicado (clampLanceToAsset é a fonte única, testada em
	// plan-estimate.test.ts).
	const lanceValue = clampLanceToAsset(lanceValueRaw, assetValue);
	const lanceMax = Math.round(assetValue * 0.8);

	// Mês-alvo efetivo: escolhido só na intenção "receber rápido"; nas demais usa o
	// default só pra dimensionar a estimativa de lance, nunca passa do prazo.
	const effectiveTargetMonth = Math.min(
		withTarget ? targetMonth : payload.targetMonthDefault,
		termMonths,
	);

	const estimate = useMemo(
		() =>
			computePlanEstimate({
				category: payload.category,
				assetValue,
				termMonths,
				targetMonth: effectiveTargetMonth,
				lanceValue: withLance ? lanceValue : 0,
				lanceEmbutido: withLance && lanceEmbutido,
			}),
		[
			payload.category,
			assetValue,
			termMonths,
			effectiveTargetMonth,
			withLance,
			lanceValue,
			lanceEmbutido,
		],
	);

	const feePct = TYPICAL_ADMIN_FEE_PCT[payload.category];
	const total = Math.round(assetValue * (1 + feePct / 100));

	const submit = () => {
		if (submitted || isStreaming) return;
		setSubmitted(true);
		const intentLabel = INTENTS.find((i) => i.value === intent)?.label ?? "";
		const label =
			`${brl(assetValue)} · ${termMonths} meses · ${intentLabel}` +
			(withTarget ? ` · contemplar em ~${effectiveTargetMonth}m` : "") +
			(withLance && lanceValue > 0 ? ` · lance ${brl(lanceValue)}` : "");
		void sendAction(
			{
				kind: "gate",
				gate: "credit",
				value: {
					credit: assetValue,
					// parcela é o RESULTADO calmo (calculada), não escolhida — alimenta a
					// recomendação com a parcela que o prazo escolhido produz.
					monthlyBudget: estimate.monthlyPayment,
					termMonths,
					intent,
					...(withTarget ? { targetMonth: effectiveTargetMonth } : {}),
					...(withLance ? { lanceValue, lanceEmbutido } : {}),
				},
				label,
			},
			label,
		);
	};

	if (submitted || !active) return null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 300, damping: 25 }}
		>
			<Card className="overflow-hidden rounded-[12px] border-[color:var(--border-strong)] shadow-lg">
				<CardContent className="space-y-3.5 p-3.5">
					<p className="flex items-center gap-2 text-sm font-medium">
						<span className="flex size-[26px] items-center justify-center rounded-full bg-[var(--surface-ink)] p-1.5">
							<SunMark variant="white" className="size-full" />
						</span>
						Planeje sua conquista
					</p>

					{/* Valor do bem — FIX-55: input numérico livre ao lado do slider, pro
					    usuário digitar valor quebrado (R$ 347.500) sem snap ao step. */}
					<IndicatorSlider
						label="Quanto custa o que você quer?"
						value={assetValue}
						display={brl(assetValue)}
						min={payload.credit.min}
						max={payload.credit.max}
						step={payload.credit.step}
						onChange={setAssetValue}
						testId="plan-asset"
						editable
						inputTestId="plan-asset-input"
					/>

					{/* Segmented control: o que mais importa (dirige os controles abaixo) */}
					<div className="space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							O que mais importa pra você agora?
						</span>
						<div
							role="radiogroup"
							aria-label="O que mais importa pra você agora?"
							className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
						>
							{INTENTS.map((opt) => (
								// biome-ignore lint/a11y/useSemanticElements: segmented control — <input type="radio"> não aceita a estilização de chip, e o container já expõe role="radiogroup".
								<button
									key={opt.value}
									type="button"
									role="radio"
									aria-checked={intent === opt.value}
									disabled={isStreaming}
									onClick={() => setIntent(opt.value)}
									data-testid={`plan-intent-${opt.value}`}
									className={cn(
										"rounded-lg px-1.5 py-2 text-xs font-medium transition-colors",
										intent === opt.value
											? "bg-primary text-primary-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>

					{/* Prazo do plano (sempre presente) */}
					<IndicatorSlider
						label="Em quantos meses quer pagar"
						value={termMonths}
						display={`${termMonths} ${termMonths === 1 ? "mês" : "meses"}`}
						min={payload.term.min}
						max={payload.term.max}
						step={payload.term.step}
						onChange={setTermMonths}
						testId="plan-term"
					/>

					{/* Condicional "receber rápido" → mês-alvo de contemplação */}
					{withTarget ? (
						<IndicatorSlider
							label="Quero ser contemplado em até"
							value={effectiveTargetMonth}
							display={`${effectiveTargetMonth} ${effectiveTargetMonth === 1 ? "mês" : "meses"}`}
							min={1}
							max={termMonths}
							step={1}
							onChange={setTargetMonth}
							testId="plan-target"
						/>
					) : null}

					{/* Condicional "tenho um lance" → valor do lance + embutido */}
					{withLance ? (
						<div className="space-y-3" data-testid="plan-lance-block">
							<IndicatorSlider
								label="Quanto você tem pra dar de lance"
								value={lanceValue}
								display={lanceValue > 0 ? brl(lanceValue) : "sem lance"}
								min={0}
								max={lanceMax}
								step={payload.credit.step / 10 >= 100 ? Math.round(payload.credit.step / 10) : 100}
								onChange={setLanceValue}
								testId="plan-lance"
							/>
							<div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted px-3 py-2.5">
								<div className="min-w-0">
									<span className="text-xs font-medium">Somar lance embutido</span>
									<p className="text-[11px] text-muted-foreground">
										Usa parte do próprio valor do bem como lance — ajuda quem não tem todo o lance
										em dinheiro hoje.
									</p>
								</div>
								<Checkbox
									checked={lanceEmbutido}
									onCheckedChange={(v) => setLanceEmbutido(v === true)}
									disabled={isStreaming}
									data-testid="plan-embutido"
								/>
							</div>
						</div>
					) : null}

					{/* Resultado calmo — a parcela como consequência, em faixa creme */}
					<div
						className="space-y-1 rounded-2xl bg-[var(--aja-cream)] px-4 py-3.5"
						data-testid="plan-estimate"
					>
						<span className="text-xs font-medium text-muted-foreground">Sua parcela fica em</span>
						<div className="flex items-baseline gap-1.5">
							<motion.b
								key={estimate.monthlyPayment}
								initial={{ scale: 1.04 }}
								animate={{ scale: 1 }}
								className="text-[1.75rem] font-bold leading-none tabular-nums text-[var(--surface-ink)]"
							>
								{brlExact(estimate.monthlyPayment)}
							</motion.b>
							<span className="text-sm text-muted-foreground">/mês</span>
						</div>
						<p className="text-[11px] text-muted-foreground">
							{brl(total)} no total · taxa de {feePct}% já inclusa
						</p>

						{withTarget && estimate.mode === "lance" ? (
							<Row
								label={`Lance pra contemplar no mês ${effectiveTargetMonth}`}
								value={`${brl(estimate.requiredLanceValue)} (~${estimate.requiredLancePct}%)`}
							/>
						) : null}
						{withLance ? (
							<p
								className={cn(
									"text-[11px]",
									estimate.lanceCoberto ? "text-success" : "text-warning",
								)}
								data-testid="plan-lance-feedback"
							>
								{estimate.lanceCoberto
									? "✓ Com esse lance dá pra antecipar bem a contemplação."
									: "Seu lance ajuda, mas ainda não cobre contemplar logo no começo."}
							</p>
						) : null}

						<p className="flex items-start gap-1 pt-0.5 text-[11px] text-muted-foreground">
							<Info className="mt-0.5 size-3 shrink-0" />
							Estimativa de mercado — os valores reais vêm das administradoras na próxima etapa.
						</p>
					</div>

					<Button
						onClick={submit}
						disabled={submitted || isStreaming}
						size="sm"
						className="w-full gap-1.5 rounded-full text-xs"
						data-testid="plan-submit"
					>
						{submitted ? (
							<>
								<Check className="size-3.5" />
								Enviado
							</>
						) : (
							<>
								Buscar opções reais
								<ArrowRight className="size-3.5" />
							</>
						)}
					</Button>
				</CardContent>
			</Card>
		</motion.div>
	);
}

function IndicatorSlider({
	label,
	value,
	display,
	min,
	max,
	step,
	onChange,
	testId,
	editable = false,
	inputTestId,
}: {
	label: string;
	value: number;
	display: string;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	testId: string;
	/** FIX-55: troca o display estático por um input numérico livre (valor exato). */
	editable?: boolean;
	inputTestId?: string;
}) {
	// FIX-55: o texto do input é estado próprio (permite digitar livre); só
	// commita (parse + clamp) no blur/Enter. Reflete o arrasto do slider via effect.
	const [text, setText] = useState(() => value.toLocaleString("pt-BR"));
	useEffect(() => {
		setText(value.toLocaleString("pt-BR"));
	}, [value]);

	const commit = () => {
		const parsed = parseDigits(text);
		const clamped = Math.min(max, Math.max(min, parsed ?? min));
		onChange(clamped);
		setText(clamped.toLocaleString("pt-BR"));
	};

	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-xs font-medium text-muted-foreground">{label}</span>
				{editable ? (
					<span className="flex items-center gap-1 text-primary">
						<span className="text-xs font-medium">R$</span>
						<Input
							value={text}
							inputMode="numeric"
							onChange={(e) => setText(e.target.value)}
							onBlur={commit}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									commit();
								}
							}}
							data-testid={inputTestId}
							aria-label={label}
							className="h-7 w-24 px-2 text-right text-sm font-bold text-primary tabular-nums"
						/>
					</span>
				) : (
					<motion.span
						key={value}
						initial={{ scale: 1.05 }}
						animate={{ scale: 1 }}
						className="text-sm font-bold text-primary tabular-nums"
					>
						{display}
					</motion.span>
				)}
			</div>
			<Slider
				value={[value]}
				min={min}
				max={max}
				step={step}
				onValueChange={(val) => onChange(Array.isArray(val) ? val[0] : val)}
				data-testid={testId}
			/>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between gap-3 text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-semibold tabular-nums">{value}</span>
		</div>
	);
}
