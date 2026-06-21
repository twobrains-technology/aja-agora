"use client";

import { MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
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
import type { Administradora } from "./administradoras-table";

interface Props {
	administradora: Administradora;
	onEdit: () => void;
	onRefresh: () => void;
}

export function AdministradoraRowActions({ administradora, onEdit, onRefresh }: Props) {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	async function toggleActive() {
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/administradoras/${administradora.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isActive: !administradora.isActive }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			onRefresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setActionError(`Falha ao atualizar status: ${message}`);
		} finally {
			setBusy(false);
		}
	}

	async function confirmDelete() {
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/administradoras/${administradora.id}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			setDeleteOpen(false);
			onRefresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setActionError(`Falha ao remover: ${message}`);
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
					<DropdownMenuItem onClick={toggleActive}>
						{administradora.isActive ? (
							<>
								<PowerOff className="size-4" />
								Desativar
							</>
						) : (
							<>
								<Power className="size-4" />
								Ativar
							</>
						)}
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => setDeleteOpen(true)}
						className="text-destructive focus:text-destructive"
					>
						<Trash2 className="size-4" />
						Remover
					</DropdownMenuItem>
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

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Remover administradora</DialogTitle>
						<DialogDescription>
							<strong>{administradora.nome}</strong> e todos os documentos (PDFs) associados serão
							removidos permanentemente. Esta ação não pode ser desfeita.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy}>
							Cancelar
						</Button>
						<Button variant="destructive" onClick={confirmDelete} disabled={busy}>
							{busy ? "Removendo…" : "Remover"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
