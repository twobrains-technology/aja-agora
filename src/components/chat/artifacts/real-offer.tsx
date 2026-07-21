"use client";

import { BadgeCheck, Check, Info, ShieldCheck } from "lucide-react";
import { SunMark } from "@/components/brand/sun-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useChatContext } from "@/lib/chat/provider";
import type { RealOfferPayload } from "@/lib/chat/types";
import { AdministradoraLogo } from "./administradora-logo";

const brl = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// FIX-232 (docs/02-cards-novos.md "real-offer"): chips de credibilidade da
// proposta final — fixos, sem dado variável (não precisam de fonte).
const CREDIBILITY_CHIPS = [
	"Sem juros",
	"Fiscalizado pelo Banco Central",
	"Dados protegidos (LGPD)",
	"Acompanhamento até a contemplação",
];

// Oferta REAL confirmada pela administradora (re-simulação Bevi). O usuário confirma
// antes do choose_offer — fecha o gap indicativo×real da Descoberta.
export function RealOffer({ payload }: { payload: RealOfferPayload }) {
	const { sendAction, sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	return (
		<Card className="w-full max-w-[340px] rounded-[12px] shadow-lg border-[color:var(--border-strong)]">
			<CardContent className="space-y-3 pt-4 px-4 pb-4">
				{/* FIX-232 — header co-branded: Aja Agora + administradora */}
				<div className="flex items-center justify-between gap-2 pb-1">
					<span className="flex size-6 items-center justify-center rounded-full bg-[var(--surface-ink)] p-1">
						<SunMark variant="white" className="size-full" />
					</span>
					<span className="text-muted-foreground text-xs">+</span>
					<AdministradoraLogo
						administradora={payload.administradora}
						className="size-6 shrink-0 text-[10px]"
					/>
					<span className="flex-1" />
				</div>

				{/* Selo de confirmação */}
				<div className="flex items-center gap-2 text-primary">
					<BadgeCheck className="size-[18px] shrink-0" />
					<p className="text-sm font-semibold">Confirmado com a {payload.administradora}</p>
				</div>

				{/* FIX-232 — selo "0% de juros" */}
				<div className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-primary">
					<ShieldCheck className="size-4 shrink-0" />
					<p className="text-xs font-semibold leading-snug">
						0% de juros — você paga o bem, não os juros do banco
					</p>
				</div>

				{/* Bloco de dados (stored). BUG-PARCELA-STRING (2026-06-12): payload
				    pode chegar com número null/ausente (a Bevi mudou o shape da API)
				    — o card NUNCA morre por isso: omite a linha (D11: nenhum número
				    inventado) e mantém os CTAs vivos. */}
				<div className="rounded-xl bg-muted/40 p-3 space-y-2">
					{Number.isFinite(payload.creditValue) && (
						<Row label="Valor do bem" value={brl(payload.creditValue)} strong />
					)}
					{Number.isFinite(payload.monthlyPayment) && (
						<Row label="Parcela" value={brl2(payload.monthlyPayment as number)} />
					)}
					{/* FIX-39: prazo REAL da API nova (defensivo — nunca NaN/derivado). */}
					{Number.isFinite(payload.termMonths) && (
						<Row label="Prazo" value={`${payload.termMonths} meses`} />
					)}
					<Row label="Grupo" value={payload.grupo} />
					{/* FIX-40: lance médio do grupo — rótulo LITERAL do campo da Bevi.
					    Só com fonte; NUNCA promete contemplação (regra D11). */}
					{Number.isFinite(payload.avgBidValue) && (
						<Row label="Lance médio do grupo" value={brl(payload.avgBidValue as number)} />
					)}
					<Row label="Administradora" value={payload.administradora} />
				</div>

				{/* FIX-197/FIX-247 (§3.6, rodada 3 — Fable r2 N3) — aviso de ajuste no
				    FECHAMENTO: rawCreditValue é o valor PEDIDO pelo cliente (âncora do
				    reveal); creditValue é a carta REAL que a administradora fechou. A
				    copy antiga ("essa carta" apontando pro pedido, "sua faixa" pra
				    carta nova) estava semanticamente INVERTIDA — corrigido pra "pedido
				    × carta real", sem ambiguidade. Exibe só quando os dois divergem. */}
				{payload.rawCreditValue != null &&
					Number.isFinite(payload.rawCreditValue) &&
					Number.isFinite(payload.creditValue) &&
					Math.round(payload.rawCreditValue) !== Math.round(payload.creditValue) && (
						<p
							data-testid="credit-adjustment-notice"
							className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground"
						>
							<Info className="mt-0.5 size-3 shrink-0 text-primary" />
							<span>
								Você pediu uma carta de ~{brl(payload.rawCreditValue)} — a carta real ficou em{" "}
								{brl(payload.creditValue)}.
							</span>
						</p>
					)}

				{/* FIX-13/FIX-39: com prazo da API, a copy fala só das DEMAIS condições;
				    sem prazo (shape antigo / API volta atrás), mantém o fallback honesto
				    do FIX-13 (D11: nenhum número sem fonte — explicar, nunca derivar). */}
				<p className="text-[11px] text-muted-foreground leading-snug">
					{Number.isFinite(payload.termMonths)
						? "Demais condições: na sua proposta (PDF), logo após a confirmação."
						: "Prazo e demais condições: na sua proposta (PDF), logo após a confirmação."}
				</p>

				{/* FIX-232 — chips de credibilidade */}
				<div className="flex flex-wrap gap-1.5">
					{CREDIBILITY_CHIPS.map((chip) => (
						<span
							key={chip}
							className="inline-flex items-center h-6 px-[9px] rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border"
						>
							{chip}
						</span>
					))}
				</div>

				{/* CTAs */}
				<div className="flex flex-col gap-2 pt-0.5">
					<Button
						type="button"
						className="w-full min-h-[44px] rounded-full gap-2"
						onClick={() =>
							!isStreaming && void sendAction({ kind: "offer-confirm" }, "Confirmo essa carta")
						}
						disabled={isStreaming}
						data-testid="offer-confirm"
					>
						<Check className="size-4" />
						Confirmar e contratar
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="w-full rounded-full min-h-[44px]"
						onClick={() => !isStreaming && void sendUserMessage("Quero ver outras opções")}
						disabled={isStreaming}
						data-testid="offer-reject"
					>
						Ver outras opções
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="text-muted-foreground text-xs">{label}</span>
			<span className={`aja-num text-sm${strong ? " font-bold" : " font-medium"}`}>{value}</span>
		</div>
	);
}
