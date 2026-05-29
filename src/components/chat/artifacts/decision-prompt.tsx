"use client";

import { ArrowRight, FileSignature, Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useChatContext } from "@/lib/chat/provider";
import {
	DECISION_PROMPT_OPTIONS,
	DECISION_PROMPT_QUESTION,
	type DecisionPromptPayload,
} from "@/lib/chat/types";

const ICONS = {
	contratar: FileSignature,
	outras: ArrowRight,
	especialista: Headset,
} as const;

// Card de decisão "Esse plano faz sentido?" (jornada do .docx etapa 4).
// Os botões enviam o texto do label como mensagem do usuário — os fluxos
// existentes interpretam (contratar → lead form, outras → recomendação,
// especialista → handoff). Sem ChatAction nova: o label é o sinal.
export function DecisionPrompt({ payload }: { payload: DecisionPromptPayload }) {
	const { sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const choose = (label: string) => {
		if (isStreaming) return;
		void sendUserMessage(label);
	};

	return (
		<Card className="w-full max-w-sm">
			<CardContent className="space-y-3 pt-4">
				<p className="text-sm font-medium">
					{DECISION_PROMPT_QUESTION}
					{payload.administradora ? (
						<span className="text-muted-foreground"> ({payload.administradora})</span>
					) : null}
				</p>
				<div className="flex flex-col gap-2">
					{DECISION_PROMPT_OPTIONS.map((opt) => {
						const Icon = ICONS[opt.intent];
						return (
							<Button
								key={opt.intent}
								type="button"
								variant={opt.intent === "contratar" ? "default" : "outline"}
								size="sm"
								className="justify-start gap-2 min-h-[44px]"
								onClick={() => choose(opt.label)}
								disabled={isStreaming}
								data-testid={`decision-${opt.intent}`}
							>
								<Icon className="size-4" />
								{opt.label}
							</Button>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}
