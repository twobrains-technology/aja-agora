"use client";

import { ArrowRight, Check, Info } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { useChatContext } from "@/lib/chat/provider";
import type { PlanGatePartData } from "@/lib/chat/ui-message";
import { clampLanceToAsset, computePlanEstimate } from "@/lib/consorcio/plan-estimate";

// FIX-3 — "Planeje sua conquista" (passo 2, gate credit). Componente dinâmico
// do Bernardo na visão do Kairo: 4 indicadores interligados (valor do bem ·
// quando quer usar · parcela mensal · lance disponível) + opt-in de lance
// embutido com a educação do docx. Mexeu num indicador → estimativa recalcula
// ao vivo. TUDO aqui é ESTIMATIVA DE MERCADO (selo obrigatório) — a Bevi só
// simula com CPF (identify, D1); os números reais chegam no reveal e no
// simulador do passo 4 (oferta ativa, FIX-6).

const brl = (v: number) =>
	v >= 1_000_000
		? `R$ ${(v / 1_000_000).toFixed(1).replace(".0", "")} mi`
		: v >= 1_000
			? `R$ ${(v / 1_000).toFixed(0)} mil`
			: `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const brlExact = (v: number) =>
	`R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
	const [targetMonth, setTargetMonth] = useState(payload.targetMonthDefault);
	const [monthlyBudget, setMonthlyBudget] = useState(payload.monthly.default);
	const [lanceValueRaw, setLanceValue] = useState(0);
	// QA-crítico P2: o teto do lance acompanha o valor do bem — se o usuário
	// reduz o bem, o lance EFETIVO rebaixa pro teto novo (clamp derivado, sem
	// estado duplicado): clampLanceToAsset é a fonte única da regra (testada
	// em plan-estimate.test.ts).
	const lanceValue = clampLanceToAsset(lanceValueRaw, assetValue);
	const lanceMax = Math.round(assetValue * 0.8);
	// null = não decidiu (gate de lance embutido continua na conversa);
	// true/false = decisão tomada aqui mesmo.
	const [lanceEmbutido, setLanceEmbutido] = useState<boolean | null>(null);

	const estimate = useMemo(
		() =>
			computePlanEstimate({
				category: payload.category,
				assetValue,
				targetMonth,
				monthlyBudget,
				lanceValue,
				lanceEmbutido: lanceEmbutido === true,
			}),
		[payload.category, assetValue, targetMonth, monthlyBudget, lanceValue, lanceEmbutido],
	);

	const submit = () => {
		if (submitted || isStreaming) return;
		setSubmitted(true);
		const label = `${brl(assetValue)} · em ~${targetMonth} meses · ${brl(monthlyBudget)}/mês${lanceValue > 0 ? ` · lance ${brl(lanceValue)}` : " · sem lance"}`;
		void sendAction(
			{
				kind: "gate",
				gate: "credit",
				value: {
					credit: assetValue,
					monthlyBudget,
					targetMonth,
					lanceValue,
					...(lanceEmbutido !== null ? { lanceEmbutido } : {}),
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
			<Card className="overflow-hidden border-primary/20">
				<CardContent className="space-y-3 p-3.5">
					<p className="text-sm font-medium">Planeje sua conquista</p>

					{/* 1 — Valor do bem */}
					<IndicatorSlider
						label="Valor do bem"
						value={assetValue}
						display={brl(assetValue)}
						min={payload.credit.min}
						max={payload.credit.max}
						step={payload.credit.step}
						onChange={setAssetValue}
						testId="plan-asset"
					/>

					{/* 2 — Quando quer usar */}
					<IndicatorSlider
						label="Quando você quer usar o valor"
						value={targetMonth}
						display={`em ~${targetMonth} ${targetMonth === 1 ? "mês" : "meses"}`}
						min={1}
						max={estimate.termMonths}
						step={1}
						onChange={setTargetMonth}
						testId="plan-target"
					/>

					{/* 3 — Parcela mensal */}
					<IndicatorSlider
						label="Parcela mensal"
						value={monthlyBudget}
						display={`${brl(monthlyBudget)}/mês`}
						min={payload.monthly.min}
						max={payload.monthly.max}
						step={payload.monthly.step}
						onChange={setMonthlyBudget}
						testId="plan-monthly"
					/>

					{/* 4 — Lance disponível */}
					<IndicatorSlider
						label="Lance que você consegue dar"
						value={lanceValue}
						display={lanceValue > 0 ? brl(lanceValue) : "sem lance"}
						min={0}
						max={lanceMax}
						step={payload.credit.step / 10 >= 100 ? Math.round(payload.credit.step / 10) : 100}
						onChange={setLanceValue}
						testId="plan-lance"
					/>

					{/* 5 — Lance embutido (educação do docx + opt-in) */}
					<div className="rounded-md bg-muted/40 px-3 py-2 space-y-1.5">
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs font-medium">Considerar lance embutido?</span>
							<Checkbox
								checked={lanceEmbutido === true}
								onCheckedChange={(v) => setLanceEmbutido(v === true)}
								disabled={isStreaming}
								data-testid="plan-embutido"
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							O lance embutido usa parte do próprio valor do bem como lance — ajuda quem não tem
							todo o valor do lance em dinheiro hoje.
						</p>
					</div>

					{/* Estimativa ao vivo */}
					<div
						className="rounded-md border border-dashed border-primary/30 px-3 py-2 space-y-1"
						data-testid="plan-estimate"
					>
						<Row label="Parcela estimada" value={`${brlExact(estimate.monthlyPayment)}/mês`} />
						<Row label="Prazo estimado" value={`${estimate.termMonths} meses`} />
						{estimate.mode === "lance" ? (
							<>
								<Row
									label={`Lance estimado pro mês ${targetMonth}`}
									value={`${brl(estimate.requiredLanceValue)} (~${estimate.requiredLancePct}%)`}
								/>
								{lanceEmbutido === true && estimate.embeddedBidValue > 0 ? (
									<>
										<Row label="↳ sai do valor do bem" value={brl(estimate.embeddedBidValue)} />
										<Row label="↳ do bolso" value={brl(estimate.ownCashNeeded)} />
										<Row label="Valor que você recebe" value={brl(estimate.receivedCredit)} />
									</>
								) : null}
								{!estimate.lanceCoberto ? (
									<p className="text-xs text-muted-foreground">
										Seu lance declarado ainda não cobre essa estimativa — dá pra ajustar o mês-alvo
										ou considerar o lance embutido.
									</p>
								) : null}
							</>
						) : (
							<Row label="Contemplação" value="sorteio pode bastar" />
						)}
						<p className="flex items-start gap-1 text-[11px] text-muted-foreground">
							<Info className="size-3 mt-0.5 shrink-0" />
							Estimativa de mercado — os valores reais vêm das administradoras na próxima etapa.
						</p>
					</div>

					<Button
						onClick={submit}
						disabled={submitted || isStreaming}
						size="sm"
						className="w-full gap-1.5 text-xs"
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
}: {
	label: string;
	value: number;
	display: string;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	testId: string;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between">
				<span className="text-xs font-medium text-muted-foreground">{label}</span>
				<motion.span
					key={value}
					initial={{ scale: 1.05 }}
					animate={{ scale: 1 }}
					className="font-mono text-sm font-bold"
				>
					{display}
				</motion.span>
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
		<div className="flex justify-between text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-mono font-medium">{value}</span>
		</div>
	);
}
