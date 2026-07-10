"use client";

import { Check, Crown } from "lucide-react";
import { useChatContext } from "@/lib/chat/provider";
import type { ComparisonTablePayload, GroupCardPayload } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { type RevealCota, useRevealSelection } from "../reveal-selection";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(value);

// FIX-242 (rodada 2, Fable r1, §D2.3): PARCELA nunca arredonda (CDC art. 30) —
// R$ 2.182,01 não pode virar "R$ 2.182". Carta (valor redondo) segue sem
// centavos (formatBRL acima); só a parcela precisa do formatador com centavos.
const formatBRL2 = (value: number): string =>
	new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function ComparisonTable({ payload }: { payload: ComparisonTablePayload }) {
	const reveal = useRevealSelection();
	const { sendAction, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	// FIX-196 — no reveal, o comparison_table vira SELETOR: tocar um chip troca a
	// cota do hero CLIENT-SIDE (sem novo turno, sem reflow). Fora do reveal (fluxo
	// "ver outras opções", que emite só o comparison_table), mantém o carrossel
	// legado que dispara `select-group` (simula a cota escolhida).
	if (reveal.isReveal) {
		return <QuotaSelector isStreaming={isStreaming} />;
	}

	const { groups, highlightBestIndex } = payload;
	if (!groups || groups.length === 0) return null;

	const handleSelect = (group: GroupCardPayload) => {
		if (isStreaming) return;
		const label = `Simular ${group.administradora} — ${formatBRL(group.creditValue)}`;
		void sendAction(
			{
				kind: "select-group",
				groupId: group.id,
				administradora: group.administradora,
				creditValue: group.creditValue,
				termMonths: group.termMonths,
				label,
			},
			label,
		);
	};

	return (
		<div
			className={cn(
				"flex gap-[11px] w-full overflow-x-auto pb-1.5",
				"[-webkit-overflow-scrolling:touch]",
				isStreaming && "pointer-events-none opacity-60",
			)}
		>
			{groups.map((group, index) => {
				const isBest = highlightBestIndex === index;
				return (
					<button
						key={group.id}
						type="button"
						tabIndex={0}
						aria-label={`Simular ${group.administradora}, parcela ${formatBRL2(group.monthlyPayment)} por mês`}
						onClick={() => handleSelect(group)}
						className={cn(
							"shrink-0 w-[150px] rounded-[14px] p-[13px] text-left",
							"flex flex-col gap-2 border bg-card cursor-pointer",
							"transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							isBest
								? "border-primary bg-primary/[0.04] hover:bg-primary/[0.07]"
								: "border-border hover:border-border/60 hover:bg-muted/40",
						)}
					>
						{/* Header: administradora + optional crown */}
						<div className="flex items-center justify-between gap-1.5 min-w-0">
							<span className="text-xs font-medium text-muted-foreground truncate">
								{group.administradora}
							</span>
							{isBest && (
								<span
									className="inline-flex items-center gap-[3px] shrink-0 h-5 px-[7px] rounded-full text-[10px] font-semibold"
									style={{ background: "var(--surface-ink)", color: "#fff" }}
								>
									<Crown className="size-[11px]" />
									Top
								</span>
							)}
						</div>

						{/* Main value — carta em destaque (FIX-231: é o que o cliente compra) */}
						<div>
							<p
								data-testid={`comparison-chip-hero-credit-${group.id}`}
								className="aja-num text-lg font-bold leading-none text-primary"
							>
								{formatBRL(group.creditValue)}
							</p>
							<p className="text-[10px] text-muted-foreground mt-0.5">Valor do bem</p>
						</div>

						{/* Divider */}
						<div className="h-px bg-border" />

						{/* Details — NÃO exibir taxa (assusta o leigo) */}
						{/* Bernardo 2026-06-11: sem "Taxa" no carrossel — composição completa na proposta (PDF). Ver CONTEXT.md (D14). */}
						<div className="flex flex-col gap-1">
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Parcela</span>
								<b
									data-testid={`comparison-chip-secondary-payment-${group.id}`}
									className="aja-num font-semibold"
								>
									{formatBRL2(group.monthlyPayment)}/mês
								</b>
							</div>
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground">Prazo</span>
								<b className="aja-num font-semibold">{group.termMonths}m</b>
							</div>
						</div>

						{/* FIX-231 — lance médio, linha discreta, só com dado real (D11). */}
						{group.avgBidValue != null && (
							<p
								data-testid={`comparison-chip-lance-medio-${group.id}`}
								className="text-[10px] text-muted-foreground -mt-0.5"
							>
								Lance médio {formatBRL(group.avgBidValue)}
							</p>
						)}
					</button>
				);
			})}
		</div>
	);
}

/** FIX-196 — seletor de cotas do reveal. Os chips leem/escrevem o
 * `selectedGroupId` compartilhado (reveal-selection); a seleção é 100%
 * client-side (nenhuma chamada ao agente). O hero + o dial rebindam à cota
 * selecionada. Selar/esmaecer durante o streaming vem do container. */
function QuotaSelector({ isStreaming }: { isStreaming: boolean }) {
	const reveal = useRevealSelection();
	if (reveal.cotas.length === 0) return null;
	// FIX-220: "Top" só quando o estágio 2 (ONDA 2) sinalizar personalização — a
	// 1ª lista (neutra, mesmo peso) não elege nenhuma cota como melhor no seletor.
	const showTop = reveal.recommendationStage === "personalized";

	return (
		<div className="flex w-full flex-col gap-1.5">
			<p className="px-0.5 text-[11px] text-muted-foreground">
				Toque numa cota pra ver no detalhe acima
			</p>
			{/* biome-ignore lint/a11y/useSemanticElements: listbox de cotas (chips button role=option) */}
			<div
				role="listbox"
				aria-label="Escolha a cota"
				className={cn(
					"flex gap-[11px] w-full overflow-x-auto pb-1.5",
					"[-webkit-overflow-scrolling:touch]",
					isStreaming && "pointer-events-none opacity-60",
				)}
			>
				{reveal.cotas.map((cota) => (
					<QuotaChip
						key={cota.groupId}
						cota={cota}
						selected={cota.groupId === reveal.selectedGroupId}
						showTop={showTop}
						onSelect={() => reveal.select(cota.groupId)}
					/>
				))}
			</div>
		</div>
	);
}

function QuotaChip({
	cota,
	selected,
	showTop,
	onSelect,
}: {
	cota: RevealCota;
	selected: boolean;
	showTop: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="option"
			aria-selected={selected}
			aria-label={`Selecionar ${cota.administradora}, parcela ${formatBRL2(cota.monthlyPayment)} por mês`}
			onClick={onSelect}
			className={cn(
				"shrink-0 w-[150px] rounded-[14px] p-[13px] text-left",
				"flex flex-col gap-2 border bg-card cursor-pointer",
				"transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				selected
					? "border-primary bg-primary/[0.06] ring-2 ring-primary/40"
					: "border-border hover:border-border/60 hover:bg-muted/40",
			)}
		>
			{/* Header: administradora + selo (Top = recomendada · ✓ = selecionada) */}
			<div className="flex items-center justify-between gap-1.5 min-w-0">
				<span className="text-xs font-medium text-muted-foreground truncate">
					{cota.administradora}
				</span>
				{selected ? (
					<span className="inline-flex items-center gap-[3px] shrink-0 h-5 px-[7px] rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
						<Check className="size-[11px]" />
						Selecionada
					</span>
				) : cota.isRecommended && showTop ? (
					<span
						className="inline-flex items-center gap-[3px] shrink-0 h-5 px-[7px] rounded-full text-[10px] font-semibold"
						style={{ background: "var(--surface-ink)", color: "#fff" }}
					>
						<Crown className="size-[11px]" />
						Top
					</span>
				) : null}
			</div>

			{/* Main value — carta em destaque (FIX-231: é o que o cliente compra) */}
			<div>
				<p
					data-testid={`quota-chip-hero-credit-${cota.groupId}`}
					className="aja-num text-lg font-bold leading-none text-primary"
				>
					{formatBRL(cota.creditValue)}
				</p>
				<p className="text-[10px] text-muted-foreground mt-0.5">Valor do bem</p>
			</div>

			{/* Divider */}
			<div className="h-px bg-border" />

			{/* Details — sem Taxa (Bernardo 2026-06-11); composição na proposta (PDF) */}
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">Parcela</span>
					<b className="aja-num font-semibold">{formatBRL2(cota.monthlyPayment)}/mês</b>
				</div>
				<div className="flex items-center justify-between text-xs">
					<span className="text-muted-foreground">Prazo</span>
					<b className="aja-num font-semibold">{cota.termMonths}m</b>
				</div>
			</div>

			{/* FIX-231 — lance médio, linha discreta, só com dado real (D11). */}
			{cota.avgBidValue != null && (
				<p className="text-[10px] text-muted-foreground -mt-0.5">
					Lance médio {formatBRL(cota.avgBidValue)}
				</p>
			)}
		</button>
	);
}
