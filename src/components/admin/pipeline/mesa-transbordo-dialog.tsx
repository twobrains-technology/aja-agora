"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

// Transbordo do kanban → MESA (FIX-64 + FIX-124). Não é mais single-select: o caso vai por
// BROADCAST a TODOS os atendentes de mesa ativos com botão "Vou atender"; o primeiro que
// clica ASSUME (claim/lock). O admin só confirma o transbordo — não escolhe atendente.
export function MesaTransbordoDialog({
	leadId,
	leadName,
	open,
	onOpenChange,
	onSuccess,
}: {
	leadId: string;
	leadName?: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: () => void;
}) {
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setSubmitError(null);
	}, [open]);

	async function onSubmit() {
		setSubmitting(true);
		setSubmitError(null);
		try {
			// Body vazio: o broadcast decide o dono (sem mesaAttendantId).
			const res = await fetch(`/api/admin/leads/${leadId}/transbordo`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});
			if (!res.ok) {
				let message = `HTTP ${res.status}`;
				try {
					const b = (await res.json()) as { error?: string };
					if (b.error === "handoff_ativo_existe") {
						message = "Este lead já tem um transbordo ativo na mesa.";
					} else if (b.error) {
						message = b.error;
					}
				} catch {
					// ignore parse errors
				}
				setSubmitError(message);
				return;
			}
			// Sucesso: mesmo com outboundError (broadcast parcial), o handoff está registrado.
			onOpenChange(false);
			onSuccess?.();
		} catch {
			setSubmitError("Erro de conexão. Tente novamente.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Transbordar para a mesa</DialogTitle>
					<DialogDescription>
						Envia o caso {leadName ? `de ${leadName} ` : ""}para todos os atendentes de mesa. O
						primeiro que tocar em "Vou atender" no WhatsApp assume o cliente e formaliza o contrato
						na administradora.
					</DialogDescription>
				</DialogHeader>

				{submitError && (
					<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
						{submitError}
					</div>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={onSubmit} disabled={submitting}>
						{submitting ? "Transbordando…" : "Transbordar para a mesa"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
