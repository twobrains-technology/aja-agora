"use client";

import { Clock3, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useChatContext } from "@/lib/chat/provider";
import type { TwoPathsPayload } from "@/lib/chat/types";

const formatBRL = (value: number): string =>
	new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
		maximumFractionDigits: 0,
	}).format(value);

// FIX-229 (docs/02-cards-novos.md CARD 3): bifurcação A/B pra quem NÃO vai
// dar lance. Invariantes duros — NUNCA % de chance/probabilidade; NENHUMA
// das duas opções é destacada como recomendada (mesmo peso visual: mesma
// variant de botão, mesmo tamanho). O agente devolve a decisão ao usuário.
export function TwoPaths({ payload }: { payload: TwoPathsPayload }) {
	const { sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const choose = (label: string) => {
		if (isStreaming) return;
		void sendUserMessage(label);
	};

	return (
		<Card className="w-full max-w-[340px] rounded-[18px] shadow-lg">
			<CardContent className="space-y-3 pt-4 px-4 pb-4">
				<p className="text-sm font-semibold leading-snug">
					Dois caminhos possíveis — sem lance
				</p>
				<div className="flex flex-col gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="justify-start gap-2 min-h-[44px] h-auto whitespace-normal text-left py-2.5 rounded-[13px] w-full border border-border"
						onClick={() =>
							choose(
								`Vou de sorteio mesmo, sem pressa — pago só a parcela de ${formatBRL(payload.monthlyPayment)}`,
							)
						}
						disabled={isStreaming}
						data-testid="two-paths-sorteio"
					>
						<Clock3 className="size-4 shrink-0" />
						<span>
							<b>Esperar o sorteio</b> — paga só a parcela de {formatBRL(payload.monthlyPayment)}{" "}
							e concorre todo mês, sem custo extra. Ideal pra quem não tem pressa.
						</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="justify-start gap-2 min-h-[44px] h-auto whitespace-normal text-left py-2.5 rounded-[13px] w-full border border-border"
						onClick={() => choose("Prefiro deixar em aberto um lance pequeno lá na frente")}
						disabled={isStreaming}
						data-testid="two-paths-lance-pequeno"
					>
						<HandCoins className="size-4 shrink-0" />
						<span>
							<b>Um lance pequeno lá na frente</b> — se sobrar um extra (13º, férias), um lance
							modesto melhora as chances. Opcional, quando fizer sentido.
						</span>
					</Button>
				</div>
				<p className="text-[11px] leading-snug text-muted-foreground">{payload.disclaimer}</p>
			</CardContent>
		</Card>
	);
}
