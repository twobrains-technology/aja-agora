"use client";

import { KeyRound, MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MesaAttendant } from "./mesa-attendants-table";

interface Props {
	attendant: MesaAttendant;
	onEdit: () => void;
	onRefresh: () => void;
}

export function MesaAttendantRowActions({ attendant, onEdit, onRefresh }: Props) {
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const [acessoOpen, setAcessoOpen] = useState(false);
	const [emailAcesso, setEmailAcesso] = useState("");
	const [acessoOk, setAcessoOk] = useState<string | null>(null);

	const temAcesso = Boolean(attendant.userId);

	/** Cria a conta `mesa_externa` e dispara o convite. A senha é definida pela
	 *  própria pessoa no link — o admin não escolhe senha de ninguém. */
	async function darAcesso() {
		setActionError(null);
		setAcessoOk(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/mesa-attendants/${attendant.id}/acesso`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: emailAcesso.trim() }),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

			setAcessoOk(
				body.warning
					? `${body.warning} Reenvie o convite pra ${emailAcesso}.`
					: `Convite enviado para ${emailAcesso}.`,
			);
			setEmailAcesso("");
			onRefresh();
		} catch (err) {
			setActionError(`Falha ao dar acesso: ${err instanceof Error ? err.message : err}`);
		} finally {
			setBusy(false);
		}
	}

	async function toggleActive() {
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/mesa-attendants/${attendant.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isActive: !attendant.isActive }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			onRefresh();
		} catch (err) {
			setActionError(`Falha ao atualizar status: ${err instanceof Error ? err.message : err}`);
		} finally {
			setBusy(false);
		}
	}

	async function confirmDelete() {
		setActionError(null);
		setBusy(true);
		try {
			const res = await fetch(`/api/admin/mesa-attendants/${attendant.id}`, { method: "DELETE" });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}
			setDeleteOpen(false);
			onRefresh();
		} catch (err) {
			setActionError(`Falha ao remover: ${err instanceof Error ? err.message : err}`);
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
					{!temAcesso && (
						<DropdownMenuItem onClick={() => setAcessoOpen(true)}>
							<KeyRound className="size-4" />
							Dar acesso ao painel
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onClick={toggleActive}>
						{attendant.isActive ? (
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

			{acessoOk && (
				<div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm shadow-md">
					{acessoOk}
					<button type="button" className="ml-2 underline" onClick={() => setAcessoOk(null)}>
						Fechar
					</button>
				</div>
			)}

			<Dialog open={acessoOpen} onOpenChange={setAcessoOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Dar acesso ao painel</DialogTitle>
						<DialogDescription>
							<strong>{attendant.nome}</strong> vai receber um convite por e-mail e definir a
							própria senha. No painel, verá apenas os casos que assumiu — do atendimento até o
							fechamento.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2">
						<Label htmlFor="email-acesso">E-mail</Label>
						<Input
							id="email-acesso"
							type="email"
							autoComplete="off"
							placeholder="nome@empresa.com.br"
							value={emailAcesso}
							onChange={(e) => setEmailAcesso(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setAcessoOpen(false)} disabled={busy}>
							Cancelar
						</Button>
						<Button
							onClick={async () => {
								await darAcesso();
								setAcessoOpen(false);
							}}
							disabled={busy || !emailAcesso.trim()}
						>
							{busy ? "Enviando…" : "Enviar convite"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Remover atendente de mesa</DialogTitle>
						<DialogDescription>
							<strong>{attendant.nome}</strong> será removido permanentemente e deixará de receber
							transbordos da mesa. Esta ação não pode ser desfeita.
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
