"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatContext } from "@/lib/chat/provider";
import type { SimulationResultPayload } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);

const formatPercent = (value: number, decimals = 1): string => `${value.toFixed(decimals)}%`;

interface CostLineProps {
	label: string;
	value: string;
	bold?: boolean;
}

function CostLine({ label, value, bold = false }: CostLineProps) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className={bold ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
				{label}
			</span>
			<span className={cn("aja-num", bold ? "text-sm font-bold" : "text-sm")}>{value}</span>
		</div>
	);
}

export function SimulationResult({ payload }: { payload: SimulationResultPayload }) {
	const { sendAction, sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const handleInterest = () => {
		if (isStreaming) return;
		const label = "Tenho interesse";
		// FIX-419 — o payload da simulação já carrega o `groupId`; mandá-lo torna a
		// resolução da cota determinística no servidor.
		void sendAction(
			{
				kind: "interest",
				administradora: payload.administradora,
				...(payload.groupId ? { groupId: payload.groupId } : {}),
				label,
			},
			label,
		);
	};

	// FIX-29: o kind vem do INTENT da action (não mais "interest" pra tudo).
	// "Comparar outra adm" → outras opções; ajuste/nova simulação → reabre o
	// what-if. "interest" é EXCLUSIVO do botão "Tenho interesse" (handleInterest).
	//
	// D7 (19/08/2026) — CADA INTENÇÃO NO SEU HANDLER, E NENHUMA TRADUÇÃO.
	//
	// O `else` deste bloco mandava TUDO que não fosse `compare_other` para
	// `adjust-value`, e o directive de "Ajustar valor" diz ao modelo que o cliente
	// quer MUDAR o valor do bem. Uma cliente clicou em "Ver cenários de
	// contemplação" e ouviu, com a simulação na tela, "qual valor você gostaria de
	// simular?". Foi a última mensagem da conversa.
	//
	// Intenção que o card não conhece NÃO vira outra intenção: entra como a fala
	// do cliente, com o rótulo que ele leu no botão. Pior caso, o modelo lê o
	// pedido verdadeiro e responde — nunca um pedido que ninguém fez.
	const handleAction = (action: { label: string; intent: string }) => {
		if (isStreaming) return;
		if (action.intent === "compare_other") {
			void sendAction(
				{ kind: "show-other-options", label: action.label, intent: "compare_other" },
				action.label,
			);
			return;
		}
		if (action.intent === "view_scenarios") {
			void sendAction(
				{
					kind: "view-scenarios",
					intent: "view_scenarios",
					administradora: payload.administradora,
					...(payload.groupId ? { groupId: payload.groupId } : {}),
					label: action.label,
				},
				action.label,
			);
			return;
		}
		if (action.intent === "compare_financing") {
			void sendAction(
				{
					kind: "compare-financing",
					intent: "compare_financing",
					administradora: payload.administradora,
					creditValue: payload.creditValue,
					label: action.label,
				},
				action.label,
			);
			return;
		}
		if (action.intent === "adjust_value" || action.intent === "new_simulation") {
			void sendAction(
				{
					kind: "adjust-value",
					intent: action.intent === "new_simulation" ? "new_simulation" : "adjust_value",
					administradora: payload.administradora,
					creditValue: payload.creditValue,
					label: action.label,
				},
				action.label,
			);
			return;
		}
		void sendUserMessage(action.label);
	};

	return (
		<div
			className={cn(
				"w-full max-w-sm bg-card border border-border rounded-[12px] overflow-hidden",
				"shadow-[0_1px_2px_rgba(10,31,51,.04),0_18px_44px_-28px_rgba(10,31,51,.22)]",
			)}
		>
			{/* Header */}
			<div className="px-[18px] pt-4 pb-0">
				<p className="text-xs text-muted-foreground m-0">Simulação · {payload.administradora}</p>
			</div>

			{/* Body */}
			<div className="px-[18px] pt-[14px] pb-[18px] flex flex-col gap-[14px]">
				{/* Hero: parcela + prazo */}
				<div>
					<p className="aja-num text-[1.625rem] font-bold leading-none text-primary tracking-[-0.02em]">
						{formatBRL(payload.monthlyPayment)}
						<span className="text-base font-normal text-muted-foreground">/mês</span>
					</p>
					<p className="text-xs text-muted-foreground mt-1">por {payload.termMonths} meses</p>
				</div>

				{/* Divider */}
				<div className="h-px bg-border" />

				{/* Valor do bem */}
				{/* Decisão de produto (Bernardo, 2026-06-11): card DIRETO — sem taxa de
				    administração, fundo de reserva, seguro, custo total nem taxa efetiva
				    (assustam o leigo). A composição completa (CMN 4.927/2021 + CDC art. 37)
				    é disclosed no PDF da proposta (signature_handoff "Ver minha proposta")
				    ANTES da assinatura — ver docs/jornada/CONTEXT.md. */}
				<div>
					<p className="text-xs text-muted-foreground m-0">Carta de crédito</p>
					<p className="aja-num text-sm font-semibold mt-0.5">{formatBRL(payload.creditValue)}</p>
				</div>

				{/* Cenário com lance (bug #10). FIX-30: o "lance estimado p/ contemplar"
				    (REAL) vive aqui — é o lance TOTAL necessário, não o embutido. */}
				{payload.lanceScenario && (
					<div
						className="rounded-[11px] px-[13px] py-[11px]"
						style={{ background: "var(--aja-cream, #f2f2db)" }}
						data-testid="cenario-com-lance"
					>
						<p className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground m-0">
							Cenário com lance
						</p>
						{/* FIX-391 — a frase era "Com lance de {X}% do valor do bem,
						    expectativa de contemplação em ~{N} meses": sem SUJEITO. O
						    percentual vem de `offer-mapper.ts:245` (`offer.bidPercentage`, o
						    nível de lance da OFERTA na Bevi) e o prazo é a expectativa PARA
						    AQUELE nível — nada disso é do cliente. Lida do jeito antigo, a
						    frase convidava o leitor a se apropriar do lance: o Bernardo tinha
						    declarado R$ 200 mil (27,7% de uma carta de 721 mil) e o agente
						    narrou os 87,57% como se fossem dele, prometendo 6 meses. Atribuir
						    o número à sua fonte é o mesmo dever do disclaimer de premissa do
						    comparativo de financiamento (D11 / CDC art. 37).

						    Revisão independente (2026-07-30) pegou dois erros na 1ª versão deste
						    fix, os dois corrigidos aqui: (a) o denominador era "do valor do BEM"
						    e é da CARTA — 631.379,70 / 721.000 = 87,57%, que é o número do print;
						    sobre o bem daria 90,20%, e os dois divergem exatamente quando há
						    embutido, que é o cenário deste card; (b) "o lance que COSTUMA
						    contemplar" é afirmação de frequência que `bidPercentage` não sustenta
						    (o campo é "lance TOTAL necessário", offer-mapper.ts:42) — mesma classe
						    do `taxaContemplacao`, que este repo já proíbe citar. */}
						<p className="text-xs mt-1 leading-[1.45]">
							Neste grupo, o lance necessário pra contemplar é de{" "}
							{payload.lanceScenario.lancePercent}% da carta de crédito — quem oferta esse nível tem
							expectativa de contemplação em ~{payload.lanceScenario.expectedTermMonths} meses{" "}
							<span className="text-muted-foreground">(estimativa, não garantia)</span>.
						</p>
						{/* FIX-8: só com dado real (> 0). FIX-30: movido pra cá — é o lance
						    necessário p/ contemplar, NÃO o embutido. */}
						{(payload.embeddedBid?.necessaryBidToContemplate ?? 0) > 0 && (
							<div className="mt-1">
								<CostLine
									label="Lance estimado p/ contemplar"
									value={formatBRL(payload.embeddedBid?.necessaryBidToContemplate as number)}
								/>
							</div>
						)}
						{/* FIX-57 (jornada2): clareza meses×lance. O stakeholder achou que
						    "mais meses = menos lance" era regra do grupo — é a mecânica do
						    consórcio (contemplation-dial.ts, correta). Aqui só comunicamos a
						    relação, sem tocar no cálculo. */}
						<p
							data-testid="meses-lance-hint"
							className="text-[11px] text-muted-foreground mt-2 leading-[1.45] m-0"
						>
							Quanto antes você quiser ser contemplado, maior o lance; com mais meses, o lance
							necessário vai caindo.
						</p>
					</div>
				)}

				{/* Lance embutido (jornada do .docx). FIX-30: só quando o recebido FECHA
				    (carta − embutido < carta). Se a fonte traz a carta CHEIA, "embute X%"
				    + "recebe tudo" se contradizem — OMITIMOS a seção até a AGX confirmar a
				    semântica (perguntas 7/8 da proposta-simulador.md). */}
				{payload.embeddedBid && payload.embeddedBid.receivedCredit < payload.creditValue && (
					<div
						className="rounded-[11px] px-[13px] py-[11px]"
						style={{ background: "var(--aja-cream, #f2f2db)" }}
					>
						<p className="text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground m-0">
							Com lance embutido ({payload.embeddedBid.percent}%)
						</p>
						<div className="mt-1 space-y-1">
							<CostLine
								label="Valor que você recebe"
								value={formatBRL(payload.embeddedBid.receivedCredit)}
							/>
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							Usa parte da própria carta como lance — sem precisar do valor todo em dinheiro
							(estimativa, não garantia). Usar o embutido significa que você recebe menos crédito da
							carta agora.
						</p>
					</div>
				)}

				{/* Correção prevista (bug #10) */}
				{payload.expectedAdjustment && (
					<p className="text-xs text-muted-foreground m-0">
						Correção prevista:{" "}
						<span className="font-medium">{payload.expectedAdjustment.index}</span> ~
						{formatPercent(payload.expectedAdjustment.annualPercent, 1)}/ano (estimativa).
					</p>
				)}

				{/* CTA primary */}
				<Button
					size="lg"
					data-testid="tenho-interesse-cta"
					className={cn(
						"w-full gap-2 min-h-[46px] rounded-full font-semibold text-sm",
						"shadow-lg shadow-primary/30 ring-1 ring-primary/40",
						"hover:shadow-primary/50 transition-shadow",
					)}
					onClick={handleInterest}
					disabled={isStreaming}
				>
					<Sparkles className="size-4" />
					Tenho interesse
				</Button>

				{/* FIX-57 (jornada2): o card terminava só no "Tenho interesse" e
					    parecia um beco sem saída — o usuário não percebia o que vinha
					    depois. Esta linha sinaliza que a jornada continua (confirmação
					    no card de decisão), sem poluir o card com mais um botão. */}
				<p
					data-testid="proximo-passo-hint"
					className="text-[11px] text-muted-foreground text-center -mt-1.5 m-0"
				>
					Próximo passo: confirmar se esse plano faz sentido pra você.
				</p>

				{/* CTAs secundárias (bug #12). FIX-7: o modelo às vezes repete
				    "Tenho interesse" nas actions — o botão interno já cobre, filtra. */}
				{payload.actions && payload.actions.length > 0 && (
					<div className="flex flex-col gap-2">
						{payload.actions
							.filter((action) => !/tenho interesse/i.test(action.label))
							.map((action) => (
								<Button
									key={action.intent}
									type="button"
									variant="ghost"
									size="sm"
									className="w-full min-h-[40px] rounded-full border border-border hover:bg-muted/50"
									onClick={() => handleAction(action)}
									disabled={isStreaming}
								>
									{action.label}
								</Button>
							))}
					</div>
				)}
			</div>
		</div>
	);
}
