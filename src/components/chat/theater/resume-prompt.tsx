"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

// FIX-51 — popup de retomada (gate de entrada da volta same-device). Dá a
// escolha: "Voltar à conversa" (hidrata, encadeia com FIX-49) ou "Começar nova"
// (thread limpa; o contato/cookie é preservado pelo POST /api/chat). Dialog do
// design system, mobile-first, não-descartável (só sai por uma das duas ações —
// decisão explícita). Cópia PT-BR sem cara de IA. Ver ADR Decisões 3 e 4.

interface ResumePromptProps {
	/** Recência da conversa anterior (ISO) — vira "há X" como pista discreta. */
	lastActivityAt?: string | null;
	/** Continuar de onde parou — hidrata o histórico. */
	onResume: () => void;
	/** Começar do zero — thread nova, sem o histórico antigo. */
	onFresh: () => void;
}

function relativeActivity(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	try {
		return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
	} catch {
		return null;
	}
}

export function ResumePrompt({ lastActivityAt, onResume, onFresh }: ResumePromptProps) {
	const when = relativeActivity(lastActivityAt);

	return (
		<Dialog open onOpenChange={() => {}}>
			{/* z-[110]: o popup precisa ficar ACIMA do ChatTheater (z-[90]), senão o
			    palco vazio do teatro cobre o popup e o usuário de retorno fica preso
			    num modal de chat vazio (BUG-RESUME-ATRAS-DO-THEATER, QA 2026-06-21).
			    O design pretendido é "palco atrás + popup por cima" (theater-chat.tsx). */}
			<DialogContent showCloseButton={false} className="z-[110] max-w-sm">
				<DialogHeader>
					<DialogTitle>Continuar de onde você parou?</DialogTitle>
					<DialogDescription>
						Você tem uma conversa em andamento por aqui. Quer voltar pra ela ou começar do zero?
						{when ? ` Última atividade ${when}.` : ""}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button type="button" variant="outline" className="min-h-11" onClick={onFresh}>
						Começar nova
					</Button>
					<Button type="button" className="min-h-11" onClick={onResume}>
						Voltar à conversa
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
