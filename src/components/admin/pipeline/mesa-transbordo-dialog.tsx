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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// Transbordo manual do kanban → atendente de mesa (FIX-64). Lista os atendentes de
// mesa ativos e dispara POST /api/admin/leads/[id]/transbordo.
interface MesaAttendant {
	id: string;
	nome: string;
	whatsapp: string;
	isActive: boolean;
}

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
	const [attendants, setAttendants] = useState<MesaAttendant[]>([]);
	const [selectedId, setSelectedId] = useState("");
	const [loading, setLoading] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setSubmitError(null);
		setSelectedId("");
		setLoading(true);
		// TODO(bloco-a): contrato de runtime — GET /api/admin/mesa-attendants devolve
		// { attendants: MesaAttendant[] } (ou array). O endpoint é do bloco A
		// (escopo: src/app/api/admin/mesa-attendants/**). Tolerante a ambos os shapes.
		fetch("/api/admin/mesa-attendants")
			.then(async (res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data: MesaAttendant[] | { attendants?: MesaAttendant[] }) => {
				const list = Array.isArray(data) ? data : (data.attendants ?? []);
				setAttendants(list.filter((a) => a.isActive));
			})
			.catch(() => setAttendants([]))
			.finally(() => setLoading(false));
	}, [open]);

	async function onSubmit() {
		if (!selectedId) {
			setSubmitError("Escolha um atendente de mesa.");
			return;
		}
		setSubmitting(true);
		setSubmitError(null);
		try {
			const res = await fetch(`/api/admin/leads/${leadId}/transbordo`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ mesaAttendantId: selectedId }),
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
						Envia o caso {leadName ? `de ${leadName} ` : ""}para um atendente de mesa, que formaliza
						o contrato na administradora pelo WhatsApp.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="mesa-attendant">Atendente de mesa</Label>
						<Select
							value={selectedId}
							onValueChange={(v) => setSelectedId(v ?? "")}
							disabled={loading || submitting}
						>
							<SelectTrigger id="mesa-attendant">
								<SelectValue placeholder={loading ? "Carregando…" : "Selecione um atendente"} />
							</SelectTrigger>
							<SelectContent>
								{attendants.map((a) => (
									<SelectItem key={a.id} value={a.id}>
										{a.nome}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{!loading && attendants.length === 0 && (
							<p className="text-sm text-muted-foreground">
								Nenhum atendente de mesa ativo cadastrado.
							</p>
						)}
					</div>

					{submitError && (
						<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
							{submitError}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={onSubmit} disabled={submitting || !selectedId}>
						{submitting ? "Transbordando…" : "Transbordar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
