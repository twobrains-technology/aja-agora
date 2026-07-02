"use client";

import { ChevronDown, Info } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { SunMark } from "@/components/brand/sun-mark";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import type { RecommendationCardPayload } from "@/lib/chat/types";
import { recommendationFitLabel } from "@/lib/consorcio/score-label";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { useRevealSelection } from "../reveal-selection";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const formatBRL0 = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(value);

// FIX-197 (§3.6) — a Bevi devolve cartas na denominação do grupo (ex. R$ 300k) e
// a tela mostra a faixa re-simulada (ex. ~R$ 131k). Sem aviso, o ajuste fica
// implícito. Exibe SÓ quando o valorCarta bruto (rawCreditValue) difere da faixa
// exibida — ancorado nos dois números reais, nunca fabricado.
const hasCreditAdjustment = (rawCreditValue: number | undefined, creditValue: number): boolean =>
	rawCreditValue != null &&
	Number.isFinite(rawCreditValue) &&
	Number.isFinite(creditValue) &&
	Math.round(rawCreditValue) !== Math.round(creditValue);

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
	monthlyFit: "Orçamento",
	contemplation: "Contemplação",
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

	// FIX-196 — hero fixo do reveal. Quando há contexto de reveal, o hero REBINDA
	// à cota selecionada no seletor (comparison_table); fora dele (card isolado /
	// fluxo legado), usa o próprio payload. A cota selecionada pode NÃO ser a
	// recomendada — nesse caso o hero não afirma "recomendação" nem exibe score
	// (as alternativas não carregam score ancorado — Lei 3, não fabricar).
	const reveal = useRevealSelection();
	const cota = reveal.isReveal ? reveal.selectedCota : null;

	const administradora = cota?.administradora ?? payload.administradora;
	const monthlyPayment = cota?.monthlyPayment ?? payload.monthlyPayment;
	const creditValue = cota?.creditValue ?? payload.creditValue;
	const termMonths = cota?.termMonths ?? payload.termMonths;
	const category = cota?.category ?? payload.category;

	// FIX-197 — aviso de ajuste de faixa (valorCarta bruto ≠ faixa exibida).
	const rawCreditValue = cota?.rawCreditValue ?? payload.rawCreditValue;
	const showAdjustNotice = hasCreditAdjustment(rawCreditValue, creditValue);

	// FIX-196/§3.1 — contemplação SÓ como contagem coagida (availableSlots real);
	// nunca `taxaContemplacao`/`contemplationRate` como %. Ausente/0 → linha oculta.
	const contempladosMes = cota
		? cota.availableSlots
		: (payload.availableSlots ?? payload.contempladosMes ?? 0);

	// Cota recomendada (selo + score ancorado) × alternativa selecionada (neutra).
	// Sem reveal, o card É a recomendação (comportamento legado preservado).
	const isRecommended = cota ? cota.isRecommended : true;
	const score = cota ? cota.score : payload.score;
	const scoreBreakdown = cota ? cota.scoreBreakdown : payload.scoreBreakdown;
	const showScoreBreakdown = isRecommended && scoreBreakdown != null;

	const handleFollow = () => {
		if (isStreaming || !cota) return;
		// FIX-196: escolha estruturada — carrega o groupId REAL resolvido → contrato
		// sem re-resolução (fim do P0). Handler server-side: bloco-a (TODO abaixo).
		const label = `Seguir com ${cota.administradora}`;
		// TODO(bloco-a): `choose_offer` é tratado no route pelo bloco-a-reveal-dados.
		void sendAction(
			{ kind: "choose_offer", groupId: cota.groupId, ofertaId: cota.ofertaId, label },
			label,
		);
	};

	const handleInterest = () => {
		if (isStreaming) return;
		const label = "Tenho interesse";
		void sendAction({ kind: "interest", administradora, label }, label);
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
				{/* Selo + rótulo qualitativo. Recomendada → marca-sol + fit label; cota
				    alternativa selecionada no seletor → selo neutro, sem afirmar score. */}
				<div className="flex items-center justify-between gap-2">
					{isRecommended ? (
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
					) : (
						<span
							className={cn(
								"inline-flex items-center h-6 px-[11px] rounded-full text-[11px] font-semibold border",
								"bg-muted text-muted-foreground border-border",
							)}
						>
							Cota selecionada
						</span>
					)}
					{/* FIX-7: rótulo qualitativo — % numérico só em contexto comparativo
					    (comparison-table); breakdown segue no expansível.
					    FIX-18: honesto quando o orçamento não fecha — monthlyFit≈0 →
					    "Melhor opção na faixa de crédito", nunca "Compatível com seu perfil". */}
					{isRecommended && score != null && scoreBreakdown != null && (
						<span className="text-sm font-semibold text-primary">
							{recommendationFitLabel(score, scoreBreakdown.monthlyFit)}
						</span>
					)}
				</div>
				<p className="text-xs text-muted-foreground m-0 truncate">{administradora}</p>
			</div>

			{/* Body */}
			<div className="px-[18px] pt-[14px] pb-[18px] flex flex-col gap-[14px]">
				{/* Hero monthly payment */}
				<div>
					<p className="text-xs text-muted-foreground m-0">Parcela mensal</p>
					<p className="aja-num text-[1.625rem] font-bold leading-none text-primary mt-1 tracking-[-0.02em] whitespace-nowrap">
						{formatBRL(monthlyPayment)}
						<span className="text-base font-normal text-muted-foreground">/mês</span>
					</p>
				</div>

				{/* Key metrics grid 2×2 */}
				<div className="grid grid-cols-2 gap-x-4 gap-y-3">
					<div>
						<p className="text-xs text-muted-foreground m-0">Valor do bem</p>
						<p className="aja-num text-sm font-semibold mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">{formatBRL(creditValue)}</p>
					</div>
					<div>
						<p className="text-xs text-muted-foreground m-0">Prazo</p>
						<p className="aja-num text-sm font-semibold mt-0.5">{termMonths} meses</p>
					</div>
					{/* docx passo 4: qtde de contemplados/mês (contagem REAL coagida).
					    FIX-196/§3.1: só exibe com dado real ancorado (>0); nunca % de
					    contemplação (taxaContemplacao é fração, não contagem). */}
					{contempladosMes > 0 && (
						<div>
							<p className="text-xs text-muted-foreground m-0">Contemplados/mês</p>
							<p className="aja-num text-sm font-semibold mt-0.5">{contempladosMes} por mês</p>
						</div>
					)}
					<div>
						<p className="text-xs text-muted-foreground m-0">Tipo de grupo</p>
						<p className="text-sm font-semibold mt-0.5">{CATEGORY_LABELS[category]}</p>
					</div>
				</div>

				{/* FIX-197 (§3.6) — aviso discreto de ajuste de faixa: a carta é da
				    denominação do grupo (rawCreditValue); ajustamos à faixa pedida
				    (creditValue). Ancorado nos dois números reais; some quando iguais. */}
				{showAdjustNotice && rawCreditValue != null && (
					<p
						data-testid="credit-adjustment-notice"
						className="flex items-start gap-1.5 -mt-1 text-[11px] leading-snug text-muted-foreground"
					>
						<Info className="mt-0.5 size-3 shrink-0 text-primary" />
						<span className="whitespace-normal break-words">
							Ajustamos essa carta de <span className="whitespace-nowrap">{formatBRL0(rawCreditValue)}</span> pra sua faixa de ~
							<span className="whitespace-nowrap">{formatBRL0(creditValue)}</span>.
						</span>
					</p>
				)}

				{/* Expandable score breakdown — só na cota recomendada (score ancorado) */}
				{showScoreBreakdown && scoreBreakdown != null && (
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
											<ScoreBar key={key} label={label} value={scoreBreakdown[key]} />
										))}
									</div>
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				)}

				{/* Divider */}
				<div className="h-px bg-border" />

				{/* CTA primary — reveal: "Seguir com <cota>" (choose_offer, groupId real);
				    legado (card isolado): "Tenho interesse" (avanço no funil). */}
				<Button
					className={cn(
						"w-full min-h-[46px] rounded-[13px] font-semibold text-sm gap-2",
						"shadow-[0_6px_16px_-6px_rgba(3,110,255,.5)]",
						"hover:brightness-[1.06] transition-filter",
					)}
					size="lg"
					onClick={cota ? handleFollow : handleInterest}
					disabled={isStreaming}
				>
					{cota ? `Seguir com ${cota.administradora}` : "Tenho interesse"}
				</Button>
			</div>
		</div>
	);
}
