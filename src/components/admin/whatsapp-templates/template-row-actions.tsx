"use client";

import { MoreHorizontal, Pencil, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WhatsappTemplate } from "./templates-table";

interface Props {
	template: WhatsappTemplate;
	onEdit: () => void;
	onRefresh: () => void;
}

export function TemplateRowActions({ template, onEdit, onRefresh }: Props) {
	const [submitOpen, setSubmitOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const canSubmit = template.status === "DRAFT";

	async function confirmSubmit() {
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/whatsapp/templates/${template.id}/submit`, {
				method: "POST",
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
				throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
			}
			setSubmitOpen(false);
			onRefresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setActionError(`Falha ao submeter: ${message}`);
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="ghost" size="icon" disabled={busy} />}>
					<MoreHorizontal className="size-4" />
					<span className="sr-only">Ações</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="max-w-60 w-full">
					<DropdownMenuItem onClick={onEdit}>
						<Pencil className="size-4" />
						Editar
					</DropdownMenuItem>
					{canSubmit && (
						<DropdownMenuItem onClick={() => setSubmitOpen(true)}>
							<Send className="size-4" />
							Submeter à Meta
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>

			{actionError && (
				<div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive shadow-md">
					{actionError}
					<button type="button" className="ml-2 underline" onClick={() => setActionError(null)}>
						Fechar
					</button>
				</div>
			)}

			<Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Submeter à Meta</DialogTitle>
						<DialogDescription>
							O template <strong className="font-mono">{template.metaName}</strong> será enviado à
							Meta para aprovação e passará a <strong>Em análise</strong>. A cópia e a categoria não
							poderão mais ser editadas depois disso.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setSubmitOpen(false)} disabled={busy}>
							Cancelar
						</Button>
						<Button onClick={confirmSubmit} disabled={busy}>
							{busy ? "Submetendo…" : "Submeter"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
