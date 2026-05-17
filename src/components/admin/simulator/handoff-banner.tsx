"use client";

import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { SimulatorChat } from "./attendant/simulator-chat";

interface HandoffBannerProps {
	/** Quando true mostra botão "Assumir eu mesmo" que abre o SimulatorChat de
	 * atendente num painel lateral, pra QA solo sem precisar de outro tab. */
	showAssumeInline?: boolean;
}

/**
 * Mostrado dentro do simulador de cliente quando a conversa entra em handed_off.
 * Tem 2 affordances:
 *   1. Link pra /admin/simulator/attendant (outra aba) — caso a equipe esteja em modo time
 *   2. Botão "Assumir eu mesmo" (opcional) — abre painel lateral com SimulatorChat dentro
 */
export function HandoffBanner({ showAssumeInline = true }: HandoffBannerProps) {
	const [assumeOpen, setAssumeOpen] = useState(false);

	return (
		<div className="flex items-start gap-3 border-b border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100">
			<AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
			<div className="flex-1">
				<div className="font-medium">Handoff disparado</div>
				<p className="text-xs">
					O agente passou a conversa pra um atendente humano. Você pode aguardar alguém da equipe
					assumir via{" "}
					<Link
						href="/admin/simulator/attendant"
						target="_blank"
						className="inline-flex items-center gap-1 underline"
					>
						painel do atendente
						<ExternalLinkIcon className="size-3" />
					</Link>
					{showAssumeInline ? " ou assumir você mesmo agora:" : "."}
				</p>
				{showAssumeInline && (
					<Button
						size="sm"
						variant="outline"
						className="mt-2 h-7"
						onClick={() => setAssumeOpen(true)}
					>
						Assumir eu mesmo
					</Button>
				)}
			</div>

			{showAssumeInline && (
				<Sheet open={assumeOpen} onOpenChange={setAssumeOpen}>
					<SheetContent side="right" className="w-full max-w-[640px] overflow-y-auto">
						<SheetHeader>
							<SheetTitle>Painel do atendente — simulação</SheetTitle>
							<SheetDescription>
								Escolha um atendente cadastrado pra reivindicar essa conversa. As mensagens
								simuladas chegam aqui com badge 🧪 SIMULAÇÃO.
							</SheetDescription>
						</SheetHeader>
						<div className="mt-4">
							<SimulatorChat />
						</div>
					</SheetContent>
				</Sheet>
			)}
		</div>
	);
}
