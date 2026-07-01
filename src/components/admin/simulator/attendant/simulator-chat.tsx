"use client";

import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type InteractivePayload,
	WhatsAppInteractive,
} from "@/components/admin/simulator/whatsapp/whatsapp-interactive";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/utils/id";

type Attendant = {
	id: string;
	name: string;
	email: string;
	phone: string | null;
	status: "pending" | "active" | "inactive";
};

type Message = {
	id: string;
	direction: "inbound" | "outbound";
	text: string;
	createdAt: string;
	/** True quando a mensagem original veio de uma conversa simulada (cliente do simulador). */
	simulated?: boolean;
	/** Botões interativos (ex.: "Vou atender" da mesa) — clicáveis quando inbound. */
	interactive?: InteractivePayload;
};

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export function SimulatorChat() {
	const [attendants, setAttendants] = useState<Attendant[] | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string>("");
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [sending, setSending] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
	const eventSourceRef = useRef<EventSource | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			setLoadError(null);
			try {
				const res = await fetch("/api/admin/attendants", { cache: "no-store" });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = (await res.json()) as { attendants: Attendant[] };
				if (!cancelled) {
					setAttendants(data.attendants.filter((a) => a.phone !== null));
				}
			} catch (err) {
				if (!cancelled) {
					const message = err instanceof Error ? err.message : String(err);
					setLoadError(`Falha ao carregar atendentes: ${message}`);
					setAttendants([]);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!selectedId) return;

		setMessages([]);
		setConnectionStatus("connecting");

		const es = new EventSource(`/api/admin/simulator/attendant/${selectedId}/stream`);
		eventSourceRef.current = es;

		es.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as
					| { type: "connected" }
					| { type: "ping" }
					| {
							type: "message";
							message: {
								id: string;
								text: string;
								createdAt: string;
								simulated?: boolean;
								interactive?: InteractivePayload;
							};
					  };

				if (data.type === "connected") {
					setConnectionStatus("connected");
					return;
				}
				if (data.type === "ping") return;
				if (data.type === "message") {
					setMessages((prev) => [
						...prev,
						{
							id: data.message.id,
							direction: "inbound",
							text: data.message.text,
							createdAt: data.message.createdAt,
							simulated: data.message.simulated,
							interactive: data.message.interactive,
						},
					]);
				}
			} catch {
				// ignore malformed events
			}
		};

		es.onerror = () => {
			setConnectionStatus("error");
		};

		return () => {
			es.close();
			eventSourceRef.current = null;
		};
	}, [selectedId]);

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	const sendReply = useCallback(async () => {
		const text = input.trim();
		if (!text || !selectedId || sending) return;
		setSending(true);
		const optimistic: Message = {
			id: `local-${generateId()}`,
			direction: "outbound",
			text,
			createdAt: new Date().toISOString(),
		};
		setMessages((prev) => [...prev, optimistic]);
		setInput("");
		try {
			const res = await fetch(`/api/admin/simulator/attendant/${selectedId}/reply`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ text }),
			});
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setMessages((prev) => [
				...prev,
				{
					id: `err-${generateId()}`,
					direction: "inbound",
					text: `[erro ao enviar: ${message}]`,
					createdAt: new Date().toISOString(),
				},
			]);
		} finally {
			setSending(false);
		}
	}, [input, selectedId, sending]);

	const sendInteractiveReply = useCallback(
		async (replyId: string, replyTitle: string) => {
			if (!selectedId || sending) return;
			setSending(true);
			const optimistic: Message = {
				id: `local-${generateId()}`,
				direction: "outbound",
				text: replyTitle,
				createdAt: new Date().toISOString(),
			};
			setMessages((prev) => [...prev, optimistic]);
			try {
				const res = await fetch(`/api/admin/simulator/attendant/${selectedId}/interactive-reply`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ replyId, replyTitle }),
				});
				if (!res.ok) {
					const data = (await res.json().catch(() => ({}))) as { error?: string };
					throw new Error(data.error ?? `HTTP ${res.status}`);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setMessages((prev) => [
					...prev,
					{
						id: `err-${generateId()}`,
						direction: "inbound",
						text: `[erro ao enviar: ${message}]`,
						createdAt: new Date().toISOString(),
					},
				]);
			} finally {
				setSending(false);
			}
		},
		[selectedId, sending],
	);

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void sendReply();
		}
	};

	return (
		<Card>
			<CardContent className="space-y-4 pt-6">
				<div className="flex items-center gap-3">
					<div className="flex-1">
						{attendants === null ? (
							<Skeleton className="h-10 w-full" />
						) : (
							<Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? "")}>
								<SelectTrigger>
									<SelectValue>
										{(value) => {
											const a = attendants.find((x) => x.id === value);
											return a ? `${a.name} — ${a.phone}` : "Selecione um atendente";
										}}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{attendants.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.name} — {a.phone}
										</SelectItem>
									))}
									{attendants.length === 0 && (
										<div className="px-3 py-2 text-sm text-muted-foreground">
											Nenhum atendente com telefone cadastrado.
										</div>
									)}
								</SelectContent>
							</Select>
						)}
					</div>
					{selectedId && <ConnectionDot status={connectionStatus} />}
				</div>

				{loadError && (
					<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
						{loadError}
					</div>
				)}

				<div className="h-[480px] overflow-y-auto rounded-md border bg-muted/20 p-4">
					{!selectedId ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Escolha um atendente acima para começar.
						</div>
					) : messages.length === 0 ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Aguardando mensagens... dispare um handoff de outro WhatsApp e elas aparecerão aqui.
						</div>
					) : (
						<div className="space-y-3">
							{messages.map((m) =>
								m.direction === "inbound" && m.interactive ? (
									<WhatsAppInteractive
										key={m.id}
										payload={m.interactive}
										disabled={sending}
										onReply={(replyId, replyTitle) =>
											void sendInteractiveReply(replyId, replyTitle)
										}
									/>
								) : (
									<MessageBubble key={m.id} message={m} />
								),
							)}
							<div ref={messagesEndRef} />
						</div>
					)}
				</div>

				<div className="flex items-center gap-2">
					<Input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={onKeyDown}
						placeholder={
							selectedId ? "Digite como o atendente..." : "Selecione um atendente primeiro"
						}
						disabled={!selectedId || sending}
					/>
					<Button
						onClick={() => void sendReply()}
						disabled={!selectedId || sending || !input.trim()}
					>
						<Send className="size-4" />
						Enviar
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function MessageBubble({ message }: { message: Message }) {
	const isOutbound = message.direction === "outbound";
	return (
		<div className={cn("flex flex-col", isOutbound ? "items-end" : "items-start")}>
			{message.simulated && !isOutbound && (
				<div className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
					🧪 SIMULAÇÃO
				</div>
			)}
			<div
				className={cn(
					"max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
					isOutbound ? "bg-primary text-primary-foreground" : "bg-background border",
				)}
			>
				{message.text}
				<div
					className={cn(
						"text-[10px] mt-1 opacity-70",
						isOutbound ? "text-primary-foreground" : "text-muted-foreground",
					)}
				>
					{new Date(message.createdAt).toLocaleTimeString("pt-BR", {
						hour: "2-digit",
						minute: "2-digit",
					})}
				</div>
			</div>
		</div>
	);
}

function ConnectionDot({ status }: { status: ConnectionStatus }) {
	const color =
		status === "connected"
			? "bg-green-500"
			: status === "connecting"
				? "bg-yellow-500"
				: status === "error"
					? "bg-red-500"
					: "bg-muted-foreground";
	const label =
		status === "connected"
			? "Conectado"
			: status === "connecting"
				? "Conectando..."
				: status === "error"
					? "Desconectado"
					: "Inativo";
	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<span className={cn("size-2 rounded-full", color)} />
			<span>{label}</span>
		</div>
	);
}
