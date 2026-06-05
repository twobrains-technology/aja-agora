"use client";

import { Loader2, MessageSquareIcon, PlusIcon, SmartphoneIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SimulatorSession = {
	conversationId: string;
	channel: "web" | "whatsapp";
	waId: string | null;
	status: "active" | "handed_off" | "closed";
	contactName: string | null;
	createdAt: string;
	updatedAt: string;
	createdBy: { id: string; name: string | null } | null;
	lastMessagePreview: string | null;
};

type Scope = "all" | "mine";

interface SimulatorInboxProps {
	channel: "web" | "whatsapp";
	selectedId: string | null;
	onSelect: (conversationId: string) => void;
}

/**
 * Inbox compartilhada entre simuladores de cliente (web e whatsapp).
 * Lista todas as conversas simuladas do canal corrente (de toda a equipe),
 * com badge do autor, prévia da última mensagem, e oferece "Nova conversa" +
 * deletar. Toggle "Minhas / Todas" pra filtrar pelo usuário admin atual.
 */
export function SimulatorInbox({ channel, selectedId, onSelect }: SimulatorInboxProps) {
	const [sessions, setSessions] = useState<SimulatorSession[] | null>(null);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [scope, setScope] = useState<Scope>("all");
	const [creating, setCreating] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setError(null);
		try {
			const params = new URLSearchParams({ channel });
			if (scope === "mine") params.set("mine", "true");
			const res = await fetch(`/api/admin/simulator/sessions?${params}`, {
				cache: "no-store",
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as {
				items: SimulatorSession[];
				currentUserId: string | null;
			};
			setSessions(data.items);
			setCurrentUserId(data.currentUserId);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSessions([]);
		}
	}, [channel, scope]);

	useEffect(() => {
		void load();
	}, [load]);

	const createSession = useCallback(async () => {
		setCreating(true);
		setError(null);
		try {
			const res = await fetch("/api/admin/simulator/sessions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ channel }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { conversationId: string };
			await load();
			onSelect(data.conversationId);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setCreating(false);
		}
	}, [channel, load, onSelect]);

	const deleteSession = useCallback(
		async (id: string) => {
			setDeletingId(id);
			try {
				const res = await fetch(`/api/admin/simulator/sessions/${id}`, { method: "DELETE" });
				if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
				if (selectedId === id) onSelect("");
				await load();
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setDeletingId(null);
			}
		},
		[load, onSelect, selectedId],
	);

	const Icon = channel === "whatsapp" ? SmartphoneIcon : MessageSquareIcon;

	return (
		<div className="flex h-full flex-col">
			<div className="space-y-2 border-b p-3">
				<Button
					className="w-full"
					onClick={() => void createSession()}
					disabled={creating}
					size="sm"
				>
					{creating ? <Loader2 className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
					Nova conversa
				</Button>
				<div className="flex gap-1 rounded-md border bg-muted/40 p-0.5 text-xs">
					{(["all", "mine"] as const).map((s) => (
						<button
							key={s}
							type="button"
							onClick={() => setScope(s)}
							className={cn(
								"flex-1 rounded px-2 py-1 transition-colors",
								scope === s
									? "bg-background shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{s === "all" ? "Todas" : "Minhas"}
						</button>
					))}
				</div>
			</div>

			{error && (
				<div className="border-b border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
					{error}
				</div>
			)}

			<div className="flex-1 overflow-y-auto p-2">
				{sessions === null ? (
					<div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
					</div>
				) : sessions.length === 0 ? (
					<div className="p-4 text-center text-sm text-muted-foreground">
						Nenhuma simulação ainda. Clique em <b>Nova conversa</b> pra começar.
					</div>
				) : (
					<ul className="space-y-1">
						{sessions.map((s) => {
							const active = s.conversationId === selectedId;
							return (
								<li key={s.conversationId}>
									<button
										type="button"
										onClick={() => onSelect(s.conversationId)}
										className={cn(
											"group flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-accent",
											active && "bg-accent",
										)}
									>
										<Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-1.5 truncate text-sm font-medium">
												{s.contactName ?? "Sem nome ainda"}
												{s.status === "handed_off" && (
													<span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
														HANDOFF
													</span>
												)}
												{s.status === "closed" && (
													<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
														FECHADO
													</span>
												)}
											</div>
											<div className="truncate text-[11px] text-muted-foreground">
												{s.waId ?? "(web)"} · {new Date(s.updatedAt).toLocaleString("pt-BR")}
											</div>
											{s.lastMessagePreview && (
												<div className="mt-0.5 truncate text-[11px] text-muted-foreground">
													{s.lastMessagePreview}
												</div>
											)}
											{s.createdBy?.name && (
												<div className="truncate text-[10px] text-muted-foreground">
													por {s.createdBy.name}
													{currentUserId && s.createdBy.id === currentUserId && (
														<span className="ml-1 rounded bg-primary/15 px-1 py-px text-[9px] font-semibold uppercase text-primary">
															você
														</span>
													)}
												</div>
											)}
										</div>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												if (confirm("Apagar essa simulação?")) void deleteSession(s.conversationId);
											}}
											disabled={deletingId === s.conversationId}
											className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
											aria-label="Apagar"
										>
											{deletingId === s.conversationId ? (
												<Loader2 className="size-3.5 animate-spin" />
											) : (
												<Trash2Icon className="size-3.5" />
											)}
										</button>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</div>
	);
}
