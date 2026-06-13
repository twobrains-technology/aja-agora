"use client";

import { MoreHorizontal, Pencil, Send, UserCheck, UserX } from "lucide-react";
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
import type { Attendant } from "./attendants-table";

interface Props {
	attendant: Attendant;
	onEdit: () => void;
	onRefresh: () => void;
}

export function AttendantRowActions({ attendant, onEdit, onRefresh }: Props) {
	const [deactivateOpen, setDeactivateOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const isInactive = attendant.status === "inactive";
	const canResendInvite = attendant.status === "pending";

	async function resendInvite() {
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/attendants/${attendant.id}/resend-invite`, {
				method: "POST",
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			onRefresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setActionError(`Falha ao reenviar convite: ${message}`);
		} finally {
			setBusy(false);
		}
	}

	async function confirmDeactivate() {
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/attendants/${attendant.id}`, {
				method: "DELETE",
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			setDeactivateOpen(false);
			onRefresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setActionError(`Falha ao desativar: ${message}`);
		} finally {
			setBusy(false);
		}
	}

	async function reactivate() {
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/attendants/${attendant.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isActive: true }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			onRefresh();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setActionError(`Falha ao reativar: ${message}`);
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
				<DropdownMenuContent align="end" className={"max-w-60 w-full"}>
					<DropdownMenuItem onClick={onEdit}>
						<Pencil className="size-4" />
						Editar
					</DropdownMenuItem>
					{canResendInvite && (
						<DropdownMenuItem onClick={resendInvite}>
							<Send className="size-4" />
							Reenviar convite
						</DropdownMenuItem>
					)}
					{isInactive ? (
						<DropdownMenuItem onClick={reactivate}>
							<UserCheck className="size-4" />
							Reativar
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							onClick={() => setDeactivateOpen(true)}
							className="text-destructive focus:text-destructive"
						>
							<UserX className="size-4" />
							Desativar
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

			<Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Desativar atendente</DialogTitle>
						<DialogDescription>
							<strong>{attendant.name}</strong> deixará de receber novas conversas transferidas pela
							IA. Você pode reativar depois pelo menu de ações.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeactivateOpen(false)} disabled={busy}>
							Cancelar
						</Button>
						<Button variant="destructive" onClick={confirmDeactivate} disabled={busy}>
							{busy ? "Desativando…" : "Desativar"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
