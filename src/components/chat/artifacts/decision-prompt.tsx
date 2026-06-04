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
// "Quero ver outras opções" é DETERMINÍSTICO (action show-other-options →
// comparativo das outras ofertas da descoberta, docx: "as outras 2"). Os
// demais botões enviam o label como mensagem (contratar → contract flow,
// especialista → handoff).
export function DecisionPrompt({ payload }: { payload: DecisionPromptPayload }) {
	const { sendAction, sendUserMessage, status } = useChatContext();
	const isStreaming = status === "submitted" || status === "streaming";

	const choose = (intent: string, label: string) => {
		if (isStreaming) return;
		if (intent === "outras") {
			void sendAction({ kind: "show-other-options", label }, label);
			return;
		}
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
								onClick={() => choose(opt.intent, opt.label)}
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
