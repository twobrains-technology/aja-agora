"use client";

import { Check, Info } from "lucide-react";
import { useMemo } from "react";
import { SunMark } from "@/components/brand/sun-mark";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import type { RealOfferPayload } from "@/lib/chat/types";
import { compareWithFinancing } from "@/lib/finance/pmt";
import { AdministradoraLogo } from "./administradora-logo";

// ProposalDoc — substitui a APRESENTAÇÃO do real-offer pela proposta co-branded
// (identidade Aja Agora + administradora), recriando o conteúdo do PDF de
// terceiro no nosso modelo. O CONTRATO DE DADOS é o mesmo (RealOfferPayload +
// proposalId): o que muda é o que se renderiza com ele. Página contínua (não
// card), pensada pra ser o mesmo layout do documento gerado no fechamento.
//
// Honestidade (D11 — nenhum número sem fonte):
//   - só o que vem no payload é exibido; o que falta é OMITIDO, nunca inventado;
//   - economia vs financiamento vem de finance/pmt.ts COM a premissa exibida
//     (taxa CET) — número comparativo sem premissa é publicidade enganosa
//     (CDC art. 37);
//   - sem `taxaContemplacao`, sem "redução de prazo", sem parcela pós-contemplação
//     fabricada (handoff: 3 correções obrigatórias). A parcela que temos é a
//     CHEIA — a que o cliente paga até ser contemplada.

const brl0 = (n: number) =>
	n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORY_LABEL: Record<RealOfferPayload["category"], string> = {
	imovel: "IMÓVEL",
	auto: "AUTOS",
	moto: "MOTOS",
	servicos: "SERVIÇOS",
};

const CONFIANCA = [
	["Sem juros", "Você paga o valor do bem, não a dívida de um financiamento."],
	["Fiscalizado pelo Banco Central", "Administradoras autorizadas e supervisionadas pelo BACEN."],
	["Seus dados protegidos", "Tratamento conforme a LGPD, só para simular e contratar."],
	["A gente segue com você", "Acompanhamento da Aja Agora até a contemplação — e depois dela."],
] as const;

const JORNADA = [
	["Entrada no plano", "Você começa com parcelas que cabem no seu planejamento."],
	["Participação mensal", "Todo mês concorre por sorteio — ou antecipa com lance."],
	["Contemplação", "Ao ser contemplado, você conquista sua carta de crédito."],
	["Compra do bem", "Com o crédito liberado, você escolhe e compra seu bem."],
	["Conclusão", "Segue o pagamento até quitar o plano, já com o bem em mãos."],
] as const;

export function ProposalDoc({ payload }: { payload: RealOfferPayload }) {
	const { sendAction, sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const hasPayment = Number.isFinite(payload.monthlyPayment);
	const hasTerm = Number.isFinite(payload.termMonths);

	// Economia vs financiamento — só quando temos parcela E prazo reais (D11). A
	// premissa (taxa CET) sai no `disclaimer` e é exibida junto ao número.
	const financing = useMemo(() => {
		if (!hasPayment || !hasTerm) return null;
		const monthly = payload.monthlyPayment as number;
		const term = payload.termMonths as number;
		return compareWithFinancing({
			creditValue: payload.creditValue,
			termMonths: term,
			category: payload.category,
			consorcioMonthlyPayment: monthly,
			consorcioTotalCost: monthly * term,
		});
	}, [hasPayment, hasTerm, payload.creditValue, payload.termMonths, payload.category, payload.monthlyPayment]);

	// Economia só é "vantagem" quando o consórcio sai mais barato (delta negativo).
	const economiaTotal = financing && financing.diff.totalDelta < 0 ? -financing.diff.totalDelta : null;
	const economiaMensal =
		financing && financing.diff.monthlyDelta < 0 ? -financing.diff.monthlyDelta : null;

	const geradaEm = useMemo(
		() => new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
		[],
	);

	return (
		<div
			className="w-full max-w-[480px] overflow-hidden rounded-[12px] border border-[color:var(--border-strong)] bg-card shadow-lg"
			data-testid="proposal-doc"
		>
			{/* ── 1 · Header co-branded ── */}
			<div className="relative bg-[linear-gradient(120deg,var(--aja-ink)_0%,var(--aja-ink-soft)_100%)] px-5 py-5 text-white">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<SunMark variant="white" className="size-8" />
						<span className="text-lg font-bold tracking-tight">Aja Agora</span>
					</div>
					<div className="flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-1.5">
						<span className="text-[11px] opacity-80">administradora</span>
						<AdministradoraLogo
							administradora={payload.administradora}
							logoUrl={payload.logoUrl}
							className="size-6 shrink-0 text-[9px]"
						/>
						<span className="text-xs font-bold">{payload.administradora}</span>
					</div>
				</div>
				<div className="mt-5 text-2xl font-bold tracking-tight">Proposta de Consórcio</div>
				<div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/80">
					<span>Segmento {CATEGORY_LABEL[payload.category]}</span>
					<span>·</span>
					<span>Gerada em {geradaEm}</span>
					<span>·</span>
					<span>Selecionada pela Aja Agora</span>
					<span>·</span>
					<span>Sem compromisso</span>
				</div>
			</div>

			{/* ── 2 · Cliente + carta de crédito ── */}
			<div className="flex items-end justify-between gap-4 px-5 py-4">
				{payload.clientName ? (
					<div>
						<div className="text-xs text-muted-foreground">Cliente</div>
						<div className="mt-0.5 text-lg font-bold text-[var(--aja-navy)]">{payload.clientName}</div>
					</div>
				) : (
					<span />
				)}
				<div className="text-right">
					<div className="text-xs text-muted-foreground">Carta de crédito</div>
					<div className="aja-num mt-0.5 text-2xl font-semibold text-figure">
						{brl2(payload.creditValue)}
					</div>
				</div>
			</div>

			{/* aviso de ajuste (FIX-197/240, CDC art. 30): pedido × carta real */}
			{payload.rawCreditValue != null &&
				Number.isFinite(payload.rawCreditValue) &&
				Math.round(payload.rawCreditValue) !== Math.round(payload.creditValue) && (
					<p
						data-testid="credit-adjustment-notice"
						className="flex items-start gap-1.5 px-5 pb-1 text-[11px] leading-snug text-muted-foreground"
					>
						<Info className="mt-0.5 size-3 shrink-0 text-primary" />
						<span>
							Você pediu uma carta de ~{brl0(payload.rawCreditValue)} — a carta real ficou em{" "}
							{brl0(payload.creditValue)}.
						</span>
					</p>
				)}

			{/* ── 3 · Banner "A sua vantagem" (só com cálculo real + premissa) ── */}
			{economiaTotal != null && (
				<div className="px-5 pb-1">
					<div className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--border-strong)] bg-gradient-to-br from-primary/5 to-primary/10 px-4 py-3.5">
						<div>
							<div className="text-[11px] font-semibold uppercase tracking-wide text-primary">
								A sua vantagem
							</div>
							<div className="mt-1 text-lg font-bold leading-tight text-foreground">
								Economia estimada de <span className="text-primary">~{brl0(economiaTotal)}</span> vs
								financiamento
							</div>
							{economiaMensal != null && (
								<div className="mt-1 text-xs text-muted-foreground">
									~{brl0(economiaMensal)} a menos por mês — e{" "}
									<b className="text-foreground">sem juros</b>, do começo ao fim.
								</div>
							)}
						</div>
						<div className="shrink-0 rounded-xl border border-[color:var(--border-strong)] bg-card px-4 py-2.5 text-center">
							<div className="text-2xl font-extrabold leading-none text-primary">0%</div>
							<div className="mt-1 text-[11px] text-muted-foreground">de juros</div>
						</div>
					</div>
				</div>
			)}

			{/* ── 4 · Resumo da simulação ── */}
			<PSection kicker="Resumo da simulação" title="As condições da sua cota">
				{/* Parcela CHEIA em destaque — a que o cliente paga até ser contemplada.
				    Sem fabricar a pós-contemplação (handoff, correção #1). */}
				{hasPayment && (
					<div className="mb-4 rounded-2xl border border-[color:var(--border-strong)] bg-primary/5 px-4 py-3.5">
						<div className="text-xs font-semibold text-primary">Parcela mensal</div>
						<div className="aja-num mt-0.5 text-2xl font-semibold tracking-tight text-primary">
							{brl2(payload.monthlyPayment as number)}
							<span className="text-sm font-normal">/mês</span>
						</div>
						<div className="mt-1 text-[11px] text-muted-foreground">
							É a parcela cheia, que você paga até ser contemplada.
						</div>
					</div>
				)}
				<div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
					<div>
						<KV k="Carta de crédito" v={brl2(payload.creditValue)} />
						{hasTerm && <KV k="Prazo" v={`${payload.termMonths} meses`} />}
						{Number.isFinite(payload.avgBidValue) && (
							<KV k="Lance médio do grupo" v={brl0(payload.avgBidValue as number)} />
						)}
					</div>
					<div>
						<KV k="Administradora" v={payload.administradora} />
						<KV k="Grupo" v={payload.grupo} strong />
					</div>
				</div>
			</PSection>

			{/* ── 5 · Comparativo Consórcio × Financiamento (só com cálculo real) ── */}
			{financing && (
				<PSection kicker="Por que consórcio" title="Consórcio × Financiamento">
					<div className="overflow-hidden rounded-2xl border border-border">
						<div className="grid grid-cols-[1.3fr_1fr_1fr]">
							<CmpHead className="bg-muted text-muted-foreground">Descrição</CmpHead>
							<CmpHead className="bg-primary/10 text-right text-primary">Consórcio</CmpHead>
							<CmpHead className="bg-muted text-right text-muted-foreground">Financiamento</CmpHead>
							<CmpRow
								label="Parcela"
								a={brl2(financing.consorcio.monthlyPayment)}
								b={brl2(financing.financing.monthlyPayment)}
							/>
							<CmpRow label="Juros" a="Não" b="Sim" />
							<CmpRow label="Entrada" a="Opcional (lance)" b="Obrigatória" />
						</div>
					</div>
					<p className="mt-2 text-[11px] leading-snug text-muted-foreground">{financing.disclaimer}</p>
				</PSection>
			)}

			{/* ── 6 · Confiança ── */}
			<PSection kicker="Confiança" title="Por que com a Aja Agora">
				<div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
					{CONFIANCA.map(([t, d]) => (
						<div key={t} className="flex gap-2.5">
							<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
								✓
							</span>
							<div>
								<div className="text-sm font-bold text-[var(--aja-navy)]">{t}</div>
								<div className="mt-0.5 text-xs leading-snug text-muted-foreground">{d}</div>
							</div>
						</div>
					))}
				</div>
				<div className="mt-4 rounded-2xl border border-[var(--aja-cream)] bg-[var(--aja-cream)]/40 px-4 py-3.5">
					<div className="text-sm leading-relaxed text-foreground">
						“Você <b>não paga nada</b> até o primeiro boleto chegar. Nosso trabalho é escolher o
						melhor grupo pro seu perfil e seguir com você em cada etapa — pode falar com a gente
						quando quiser.”
					</div>
					<div className="mt-3 flex items-center gap-2">
						<SunMark variant="color" className="size-5" />
						<span className="text-xs font-bold text-[var(--aja-navy)]">Equipe Aja Agora</span>
					</div>
				</div>
			</PSection>

			{/* ── 7 · Estratégia de contemplação (informativo, não menu) ── */}
			<PSection kicker="Estratégia de contemplação" title="Dois caminhos até a carta">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div className="rounded-2xl border border-border bg-muted px-4 py-3.5">
						<div className="text-sm font-bold text-[var(--aja-navy)]">Sem lance</div>
						<div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
							Você participa dos sorteios mensais até ser contemplado.
						</div>
					</div>
					<div className="rounded-2xl border border-[color:var(--border-strong)] bg-primary/5 px-4 py-3.5">
						<div className="text-sm font-bold text-primary">Com lance</div>
						<div className="mt-1.5 text-xs leading-relaxed text-foreground">
							Com recursos próprios ou embutido, você antecipa a aquisição.
						</div>
					</div>
				</div>
			</PSection>

			{/* ── 8 · Jornada em 5 etapas ── */}
			<PSection kicker="Como funciona" title="Sua jornada em 5 etapas">
				<div className="flex flex-col gap-3">
					{JORNADA.map(([t, d], i) => (
						<div key={t} className="flex items-start gap-3">
							<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--aja-navy)] text-sm font-bold text-white">
								{i + 1}
							</span>
							<div>
								<div className="text-sm font-semibold text-[var(--aja-navy)]">{t}</div>
								<div className="mt-0.5 text-xs text-muted-foreground">{d}</div>
							</div>
						</div>
					))}
				</div>
			</PSection>

			{/* ── 9 · Observações ── */}
			<div className="border-t border-border bg-muted px-5 py-4">
				<div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					Observações
				</div>
				<div className="text-[11px] leading-relaxed text-muted-foreground">
					Os valores são estimativas e podem sofrer alterações. A contemplação não é garantida —
					depende de sorteio ou lance. A contratação está sujeita à disponibilidade de vagas no grupo
					e à aprovação da administradora. O reajuste do crédito segue as regras do grupo.
				</div>
			</div>

			{/* ── CTAs (contrato de dados preservado: offer-confirm) ── */}
			<div className="flex flex-col gap-2 border-t border-border px-5 py-4">
				<Button
					type="button"
					className="min-h-[44px] w-full gap-2 rounded-full"
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
					className="min-h-[44px] w-full rounded-full"
					onClick={() => !isStreaming && void sendUserMessage("Quero ver outras opções")}
					disabled={isStreaming}
					data-testid="offer-reject"
				>
					Ver outras opções
				</Button>
			</div>
		</div>
	);
}

function PSection({
	title,
	kicker,
	children,
}: {
	title: string;
	kicker?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="border-t border-border px-5 py-4">
			{kicker && (
				<div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
					{kicker}
				</div>
			)}
			<div className="mb-3 text-lg font-bold text-[var(--aja-navy)]">{title}</div>
			{children}
		</div>
	);
}

function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
	return (
		<div className="flex items-baseline justify-between gap-2 border-b border-border py-2">
			<span className="text-xs text-muted-foreground">{k}</span>
			<span className={`aja-num text-sm ${strong ? "font-semibold text-primary" : "font-medium"}`}>
				{v}
			</span>
		</div>
	);
}

function CmpHead({ children, className }: { children: React.ReactNode; className?: string }) {
	return <div className={`px-3 py-2.5 text-xs font-bold ${className ?? ""}`}>{children}</div>;
}

function CmpRow({ label, a, b }: { label: string; a: string; b: string }) {
	return (
		<>
			<div className="border-t border-border px-3 py-2.5 text-xs text-foreground">{label}</div>
			<div className="aja-num border-t border-border bg-primary/5 px-3 py-2.5 text-right text-xs font-medium text-primary">
				{a}
			</div>
			<div className="aja-num border-t border-border px-3 py-2.5 text-right text-xs text-muted-foreground">
				{b}
			</div>
		</>
	);
}
